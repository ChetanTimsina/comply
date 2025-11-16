const crypto = require('crypto');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const {
  getRow,
  insert,
  update,
  exists,
  getRows,
  query
} = require('../config/database');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  PaymentError
} = require('../middleware/errorHandler');
const { logPaymentTransaction, logUserAction } = require('../utils/logger');

class CardService {
  // Generate unique digital card number
  generateCardNumber() {
    // Format: 1111 2222 3333 4444 (16 digits, starting with 1111 for digital cards)
    const timestamp = Date.now().toString().slice(-8);
    const random = crypto.randomBytes(4).toString('hex').slice(0, 8);
    return `1111${timestamp}${random}`;
  }

  // Generate CVV
  generateCVV() {
    return crypto.randomInt(100, 1000).toString();
  }

  // Generate QR code data for digital card
  async generateQRCode(cardData) {
    const qrData = JSON.stringify({
      type: 'bus_card',
      card_id: cardData.id,
      card_number: cardData.digital_card_number,
      user_id: cardData.user_id,
      timestamp: moment().toISOString(),
      expires_at: moment().add(30, 'seconds').toISOString() // QR expires in 30 seconds
    });

    try {
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return qrCodeDataURL;
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  }

  // Create digital card for user
  async createCard(userId, cardData) {
    const {
      card_type = 'regular',
      physical_card_number = null,
      link_physical_card = false,
      initial_balance = 0,
      student_id_proof = null,
      disability_proof = null,
      is_tourist_card = false
    } = cardData;

    // Validate user exists
    const user = await getRow(
      'SELECT id, full_name, is_student, is_senior_citizen, is_disabled, is_tourist FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if user already has an active digital card
    const existingCard = await getRow(
      'SELECT id FROM digital_cards WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (existingCard) {
      throw new ConflictError('User already has an active digital card');
    }

    // Validate card type and proof documents
    if (card_type === 'student' && !student_id_proof && !user.is_student) {
      throw new ValidationError('Student ID proof is required for student card');
    }

    if (card_type === 'disabled' && !disability_proof && !user.is_disabled) {
      throw new ValidationError('Disability proof is required for disabled card');
    }

    if (card_type === 'senior' && !user.is_senior_citizen && !user.is_tourist) {
      throw new ValidationError('Senior citizen card is only available for users 65+ years old');
    }

    // Link physical card if requested
    let linkedPhysicalCard = null;
    if (link_physical_card && physical_card_number) {
      const physicalCard = await getRow(
        'SELECT card_number FROM physical_cards WHERE card_number = $1 AND is_linked = false',
        [physical_card_number]
      );

      if (physicalCard) {
        linkedPhysicalCard = physical_card_number;
        await query(
          'UPDATE physical_cards SET is_linked = true, linked_to_user = $1 WHERE card_number = $2',
          [userId, physical_card_number]
        );
      }
    }

    // Determine discount percentage based on card type
    const discountPercentage = this.getDiscountPercentage(card_type);

    // Generate card details
    const digital_card_number = this.generateCardNumber();
    const cvv = this.generateCVV();
    const expiry_date = moment().add(5, 'years').toDate(); // 5 years validity

    // Insert new digital card
    const cardId = await insert('digital_cards', {
      user_id: userId,
      physical_card_number: linkedPhysicalCard,
      digital_card_number,
      cvv,
      expiry_date,
      balance: initial_balance,
      card_type,
      discount_percentage: discountPercentage,
      physical_card_linked: !!linkedPhysicalCard,
      is_tourist_card
    });

    // Get the created card with user info
    const card = await getRow(
      `SELECT dc.*, u.full_name, u.phone_number
       FROM digital_cards dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.id = $1`,
      [cardId]
    );

    logUserAction(userId, 'digital_card_created', {
      card_id: cardId,
      card_type,
      initial_balance,
      linked_physical_card: linkedPhysicalCard
    });

    return card;
  }

  // Get discount percentage based on card type
  getDiscountPercentage(cardType) {
    const discounts = {
      'regular': 0,
      'student': 30,
      'disabled': 20,
      'senior': 10
    };
    return discounts[cardType] || 0;
  }

  // Get user's digital card
  async getUserCard(userId) {
    const card = await getRow(
      `SELECT dc.*, u.full_name, u.phone_number
       FROM digital_cards dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.user_id = $1 AND dc.is_active = true`,
      [userId]
    );

    if (!card) {
      throw new NotFoundError('No active digital card found');
    }

    // Add card status
    const now = moment();
    const expiry = moment(card.expiry_date);
    card.status = expiry.isBefore(now) ? 'expired' : 'active';
    card.days_until_expiry = expiry.diff(now, 'days');

    // Add balance status
    if (card.balance < 20) {
      card.balance_status = 'low';
    } else if (card.balance < 100) {
      card.balance_status = 'medium';
    } else {
      card.balance_status = 'good';
    }

    return card;
  }

  // Generate QR code for card scanning
  async generateCardQR(userId) {
    const card = await this.getUserCard(userId);

    // Check if card is active and not expired
    if (card.status !== 'active') {
      throw new ValidationError('Card is not active or has expired');
    }

    const qrCode = await this.generateQRCode(card);

    logUserAction(userId, 'qr_code_generated', {
      card_id: card.id
    });

    return {
      qr_code: qrCode,
      expires_in: 30, // seconds
      card_info: {
        card_number: card.digital_card_number.slice(-4), // Last 4 digits
        balance: card.balance,
        card_type: card.card_type
      }
    };
  }

  // Validate card for bus boarding
  async validateCard(cardNumber, cvv = null, busId = null, amount = null) {
    const card = await getRow(
      `SELECT dc.*, u.full_name, u.phone_number
       FROM digital_cards dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.digital_card_number = $1 AND dc.is_active = true`,
      [cardNumber]
    );

    if (!card) {
      throw new ValidationError('Invalid card number');
    }

    // Check expiry
    if (moment(card.expiry_date).isBefore(moment())) {
      throw new ValidationError('Card has expired');
    }

    // Check CVV if provided
    if (cvv && card.cvv !== cvv) {
      logUserAction(card.user_id, 'card_validation_failed', {
        reason: 'invalid_cvv',
        card_id: card.id
      });
      throw new ValidationError('Invalid CVV');
    }

    // Check balance if amount is provided
    if (amount !== null && card.balance < amount) {
      throw new PaymentError('Insufficient balance');
    }

    // Update last used timestamp
    await update('digital_cards', card.id, {
      last_used: new Date()
    });

    logUserAction(card.user_id, 'card_validated', {
      card_id: card.id,
      bus_id,
      amount
    });

    return {
      valid: true,
      card_id: card.id,
      user_id: card.user_id,
      user_name: card.full_name,
      card_type: card.card_type,
      discount_percentage: card.discount_percentage,
      current_balance: card.balance
    };
  }

  // Add funds to card (recharge)
  async rechargeCard(userId, amount, paymentMethod, paymentDetails = {}) {
    if (amount < 10 || amount > 5000) {
      throw new ValidationError('Recharge amount must be between 10 and 5000 ngultrum');
    }

    const card = await this.getUserCard(userId);

    // Create transaction record
    const transactionId = await insert('transactions', {
      card_id: card.id,
      type: 'recharge',
      amount,
      payment_method: paymentMethod,
      payment_gateway_transaction_id: paymentDetails.transaction_id,
      description: `Card recharge via ${paymentMethod}`,
      status: 'pending'
    });

    // Process payment (this would integrate with actual payment gateway)
    // For now, we'll simulate successful payment
    const paymentSuccessful = true;

    if (!paymentSuccessful) {
      await query(
        'UPDATE transactions SET status = $1 WHERE id = $2',
        ['failed', transactionId]
      );
      throw new PaymentError('Payment failed');
    }

    // Update card balance
    const newBalance = parseFloat(card.balance) + parseFloat(amount);
    await update('digital_cards', card.id, {
      balance: newBalance
    });

    // Mark transaction as completed
    await query(
      'UPDATE transactions SET status = $1, processed_at = $2 WHERE id = $3',
      ['completed', new Date(), transactionId]
    );

    logPaymentTransaction(transactionId, userId, amount, paymentMethod, 'completed');
    logUserAction(userId, 'card_recharged', {
      card_id: card.id,
      amount,
      payment_method: paymentMethod,
      previous_balance: card.balance,
      new_balance
    });

    return {
      transaction_id: transactionId,
      amount_recharged: amount,
      previous_balance: card.balance,
      new_balance,
      payment_method: paymentMethod
    };
  }

  // Deduct fare from card
  async deductFare(cardId, amount, rideId = null, busId = null, routeId = null) {
    const card = await getRow(
      'SELECT * FROM digital_cards WHERE id = $1 AND is_active = true',
      [cardId]
    );

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    if (card.balance < amount) {
      throw new PaymentError('Insufficient balance');
    }

    const newBalance = parseFloat(card.balance) - parseFloat(amount);

    // Create transaction record
    const transactionId = await insert('transactions', {
      card_id: cardId,
      type: 'fare',
      amount: -amount, // Negative for deduction
      payment_method: 'digital_card',
      ride_id,
      description: 'Bus fare deducted',
      status: 'completed',
      processed_at: new Date()
    });

    // Update card balance
    await update('digital_cards', cardId, {
      balance: newBalance
    });

    logPaymentTransaction(transactionId, card.user_id, amount, 'digital_card', 'completed');
    logUserAction(card.user_id, 'fare_deducted', {
      card_id: cardId,
      amount,
      new_balance: newBalance,
      bus_id,
      route_id,
      ride_id
    });

    return {
      transaction_id: transactionId,
      fare_deducted: amount,
      remaining_balance: newBalance
    };
  }

  // Get card transaction history
  async getCardTransactions(userId, page = 1, limit = 20) {
    const card = await this.getUserCard(userId);

    const transactions = await query(
      `SELECT t.*, dc.digital_card_number
       FROM transactions t
       JOIN digital_cards dc ON t.card_id = dc.id
       WHERE t.card_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [card.id, limit, (page - 1) * limit]
    );

    // Get total count for pagination
    const countResult = await query(
      'SELECT COUNT(*) as total FROM transactions WHERE card_id = $1',
      [card.id]
    );

    const total = parseInt(countResult.rows[0].total);

    return {
      transactions: transactions.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Deactivate card
  async deactivateCard(userId) {
    const card = await this.getUserCard(userId);

    await update('digital_cards', card.id, {
      is_active: false
    });

    logUserAction(userId, 'card_deactivated', {
      card_id: card.id
    });

    return { message: 'Card deactivated successfully' };
  }

  // Update card type (e.g., upgrade to student card)
  async updateCardType(userId, newType, proofDocuments = {}) {
    const card = await this.getUserCard(userId);
    const user = await getRow('SELECT * FROM users WHERE id = $1', [userId]);

    // Validate the request
    if (newType === 'student' && !proofDocuments.student_id && !user.is_student) {
      throw new ValidationError('Student ID proof is required');
    }

    if (newType === 'disabled' && !proofDocuments.disability_proof && !user.is_disabled) {
      throw new ValidationError('Disability proof is required');
    }

    const newDiscount = this.getDiscountPercentage(newType);

    await update('digital_cards', card.id, {
      card_type: newType,
      discount_percentage: newDiscount
    });

    logUserAction(userId, 'card_type_updated', {
      card_id: card.id,
      old_type: card.card_type,
      new_type: newType,
      new_discount: newDiscount
    });

    const updatedCard = await this.getUserCard(userId);
    return updatedCard;
  }

  // Get card statistics
  async getCardStats(userId) {
    const card = await this.getUserCard(userId);

    // Get transaction statistics
    const stats = await query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN type = 'fare' THEN ABS(amount) ELSE 0 END) as total_fares,
        SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END) as total_recharges,
        MAX(created_at) as last_transaction
       FROM transactions
       WHERE card_id = $1`,
      [card.id]
    );

    // Get ride statistics
    const rideStats = await query(
      `SELECT
        COUNT(*) as total_rides,
        AVG(fare_ngultrum) as average_fare,
        MAX(start_time) as last_ride
       FROM ride_history
       WHERE card_id = $1`,
      [card.id]
    );

    return {
      card: {
        id: card.id,
        card_number: card.digital_card_number,
        card_type: card.card_type,
        balance: card.balance,
        status: card.status
      },
      transactions: stats.rows[0],
      rides: rideStats.rows[0]
    };
  }
}

module.exports = new CardService();