const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  insert,
  update,
  getRow,
  query
} = require('../config/database');
const {
  PaymentError,
  ValidationError,
  ExternalServiceError
} = require('../middleware/errorHandler');
const { logPaymentTransaction, logUserAction, logError } = require('../utils/logger');

class PaymentService {
  constructor() {
    // Payment gateway configurations
    this.gateways = {
      bob: {
        name: 'Bank of Bhutan Mobile',
        clientId: process.env.BOB_CLIENT_ID,
        clientSecret: process.env.BOB_CLIENT_SECRET,
        apiUrl: process.env.BOB_API_URL || 'https://api.bob.bt',
        timeout: 30000
      },
      bnb: {
        name: 'Bhutan National Bank',
        clientId: process.env.BNB_CLIENT_ID,
        clientSecret: process.env.BNB_CLIENT_SECRET,
        apiUrl: process.env.BNB_API_URL || 'https://api.bnb.bt',
        timeout: 30000
      },
      stripe: {
        name: 'Stripe (International)',
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        timeout: 30000
      }
    };
  }

  // Initialize payment with selected gateway
  async initializePayment(userId, amount, paymentMethod, gateway, metadata = {}) {
    // Validate inputs
    if (amount < 10 || amount > 5000) {
      throw new ValidationError('Amount must be between 10 and 5000 ngultrum');
    }

    if (!this.gateways[gateway]) {
      throw new ValidationError('Invalid payment gateway');
    }

    // Create payment record
    const paymentId = await insert('payments', {
      user_id: userId,
      amount,
      currency: 'BTN',
      payment_method: paymentMethod,
      gateway,
      status: 'pending',
      gateway_transaction_id: null,
      metadata: JSON.stringify(metadata),
      created_at: new Date()
    });

    try {
      let gatewayResponse;

      switch (gateway) {
        case 'bob':
          gatewayResponse = await this.initializeBobPayment(paymentId, amount, paymentMethod, metadata);
          break;
        case 'bnb':
          gatewayResponse = await this.initializeBnbPayment(paymentId, amount, paymentMethod, metadata);
          break;
        case 'stripe':
          gatewayResponse = await this.initializeStripePayment(paymentId, amount, paymentMethod, metadata);
          break;
        default:
          throw new ValidationError('Unsupported payment gateway');
      }

      // Update payment record with gateway response
      await update('payments', paymentId, {
        gateway_transaction_id: gatewayResponse.transaction_id,
        gateway_response: JSON.stringify(gatewayResponse),
        payment_url: gatewayResponse.payment_url || null
      });

      logUserAction(userId, 'payment_initialized', {
        payment_id: paymentId,
        amount,
        gateway,
        transaction_id: gatewayResponse.transaction_id
      });

      return {
        payment_id: paymentId,
        gateway,
        amount,
        currency: 'BTN',
        transaction_id: gatewayResponse.transaction_id,
        payment_url: gatewayResponse.payment_url,
        expires_in: gatewayResponse.expires_in || 900, // 15 minutes default
        payment_instructions: gatewayResponse.instructions
      };

    } catch (error) {
      // Mark payment as failed
      await update('payments', paymentId, {
        status: 'failed',
        gateway_response: JSON.stringify({ error: error.message })
      });

      throw error;
    }
  }

  // Initialize Bank of Bhutan payment
  async initializeBobPayment(paymentId, amount, paymentMethod, metadata) {
    const bobConfig = this.gateways.bob;

    if (!bobConfig.clientId || !bobConfig.clientSecret) {
      throw new ExternalServiceError('Bank of Bhutan gateway not configured');
    }

    try {
      // Generate unique transaction reference
      const transactionRef = `BTBS${Date.now()}${paymentId.slice(-6)}`;

      // Prepare request payload
      const payload = {
        merchant_id: bobConfig.clientId,
        transaction_reference: transactionRef,
        amount: amount,
        currency: 'BTN',
        payment_method: paymentMethod,
        description: 'Bhutan Bus System Card Recharge',
        customer_info: {
          name: metadata.customer_name,
          phone: metadata.customer_phone,
          email: metadata.customer_email
        },
        callback_url: `${process.env.BASE_URL}/api/payments/callback/bob`,
        return_url: `${process.env.CLIENT_URL}/payment/success`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancelled`,
        timestamp: new Date().toISOString()
      };

      // Generate signature
      const signature = this.generateBobSignature(payload, bobConfig.clientSecret);

      // Make API request
      const response = await axios.post(`${bobConfig.apiUrl}/v1/payments/init`, {
        ...payload,
        signature
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobConfig.clientId}`
        },
        timeout: bobConfig.timeout
      });

      if (!response.data.success) {
        throw new PaymentError(response.data.message || 'Payment initialization failed');
      }

      return {
        transaction_id: response.data.transaction_id,
        payment_url: response.data.payment_url,
        expires_in: response.data.expires_in,
        instructions: {
          title: 'Complete payment using M-BOB app',
          steps: [
            'Open your M-BOB mobile banking app',
            'Scan the QR code or enter the transaction ID',
            'Confirm payment using your PIN',
            'Wait for confirmation'
          ]
        }
      };

    } catch (error) {
      if (error.response) {
        logError(error, { gateway: 'bob', paymentId });
        throw new PaymentError(`Bank of Bhutan: ${error.response.data.message || 'Payment service unavailable'}`);
      }
      throw new ExternalServiceError('Bank of Bhutan payment service unavailable');
    }
  }

  // Initialize Bhutan National Bank payment
  async initializeBnbPayment(paymentId, amount, paymentMethod, metadata) {
    const bnbConfig = this.gateways.bnb;

    if (!bnbConfig.clientId || !bnbConfig.clientSecret) {
      throw new ExternalServiceError('Bhutan National Bank gateway not configured');
    }

    try {
      // Generate unique transaction reference
      const transactionRef = `BNBS${Date.now()}${paymentId.slice(-6)}`;

      // Prepare request payload
      const payload = {
        merchant_id: bnbConfig.clientId,
        transaction_reference: transactionRef,
        amount: amount,
        currency: 'BTN',
        payment_method: paymentMethod,
        description: 'Bhutan Bus System Card Recharge',
        customer: {
          name: metadata.customer_name,
          phone: metadata.customer_phone,
          email: metadata.customer_email
        },
        callback: {
          url: `${process.env.BASE_URL}/api/payments/callback/bnb`,
          return_url: `${process.env.CLIENT_URL}/payment/success`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancelled`
        },
        timestamp: new Date().toISOString()
      };

      // Generate HMAC signature
      const signature = this.generateHmacSignature(payload, bnbConfig.clientSecret);

      // Make API request
      const response = await axios.post(`${bnbConfig.apiUrl}/payment/initiate`, {
        ...payload,
        signature
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': bnbConfig.clientId,
          'X-Signature': signature
        },
        timeout: bnbConfig.timeout
      });

      if (response.data.status !== 'success') {
        throw new PaymentError(response.data.message || 'Payment initialization failed');
      }

      return {
        transaction_id: response.data.transaction_id,
        payment_url: response.data.payment_url,
        expires_in: response.data.expiry,
        instructions: {
          title: 'Complete payment using BNB Mobile',
          steps: [
            'Open your BNB mobile banking app',
            'Select "Pay" and scan the QR code',
            'Enter transaction reference: ' + transactionRef,
            'Confirm payment with your PIN'
          ]
        }
      };

    } catch (error) {
      if (error.response) {
        logError(error, { gateway: 'bnb', paymentId });
        throw new PaymentError(`Bhutan National Bank: ${error.response.data.message || 'Payment service unavailable'}`);
      }
      throw new ExternalServiceError('Bhutan National Bank payment service unavailable');
    }
  }

  // Initialize Stripe payment (for international/tourist cards)
  async initializeStripePayment(paymentId, amount, paymentMethod, metadata) {
    const stripeConfig = this.gateways.stripe;

    if (!stripeConfig.secretKey) {
      throw new ExternalServiceError('Stripe gateway not configured');
    }

    try {
      // Convert BTN to USD (Stripe primarily uses USD)
      // This is a simplified conversion - in production, use real-time exchange rates
      const usdAmount = Math.round((amount / 74.5) * 100); // BTN to USD conversion (approximate)

      const paymentIntentData = {
        amount: usdAmount,
        currency: 'usd',
        payment_method_types: [paymentMethod === 'card' ? 'card' : 'ideal'],
        description: 'Bhutan Bus System Card Recharge',
        metadata: {
          payment_id: paymentId,
          original_amount: amount,
          original_currency: 'BTN',
          customer_name: metadata.customer_name
        },
        receipt_email: metadata.customer_email
      };

      // Create payment intent
      const response = await axios.post('https://api.stripe.com/v1/payment_intents',
        new URLSearchParams(paymentIntentData).toString(),
        {
          headers: {
            'Authorization': `Bearer ${stripeConfig.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: stripeConfig.timeout
        }
      );

      return {
        transaction_id: response.data.id,
        client_secret: response.data.client_secret,
        amount_usd: usdAmount / 100,
        expires_in: 3600, // 1 hour
        instructions: {
          title: 'International Card Payment',
          steps: [
            'Click the payment link below',
            'Enter your card details securely',
            'Complete 3D Secure verification if required',
            'Wait for payment confirmation'
          ],
          note: 'Amount will be converted from USD to BTN at current exchange rate'
        }
      };

    } catch (error) {
      if (error.response) {
        logError(error, { gateway: 'stripe', paymentId });
        throw new PaymentError(`Stripe: ${error.response.data.error?.message || 'Payment service unavailable'}`);
      }
      throw new ExternalServiceError('International payment service unavailable');
    }
  }

  // Process payment callback from gateway
  async processPaymentCallback(gateway, transactionId, status, responseData = {}) {
    try {
      // Find payment record
      const payment = await getRow(
        'SELECT * FROM payments WHERE gateway_transaction_id = $1 AND gateway = $2',
        [transactionId, gateway]
      );

      if (!payment) {
        throw new ValidationError('Payment record not found');
      }

      // Update payment status
      await update('payments', payment.id, {
        status: status === 'success' ? 'completed' : 'failed',
        gateway_response: JSON.stringify(responseData),
        processed_at: new Date()
      });

      if (status === 'success') {
        // Credit user's digital card
        await this.creditCardOnPaymentSuccess(payment.user_id, payment.amount, payment.id);

        logPaymentTransaction(payment.id, payment.user_id, payment.amount, gateway, 'completed');
        logUserAction(payment.user_id, 'payment_completed', {
          payment_id: payment.id,
          gateway,
          amount: payment.amount
        });

        // Send notification (implement notification service)
        // await notificationService.sendPaymentSuccessNotification(payment.user_id, payment.amount);

      } else {
        logPaymentTransaction(payment.id, payment.user_id, payment.amount, gateway, 'failed');
        logUserAction(payment.user_id, 'payment_failed', {
          payment_id: payment.id,
          gateway,
          amount: payment.amount,
          reason: responseData.error || 'Unknown error'
        });
      }

      return {
        payment_id: payment.id,
        status: status === 'success' ? 'completed' : 'failed',
        amount: payment.amount,
        gateway
      };

    } catch (error) {
      logError(error, { gateway, transactionId, status });
      throw error;
    }
  }

  // Credit user's digital card after successful payment
  async creditCardOnPaymentSuccess(userId, amount, paymentId) {
    try {
      // Get user's active digital card
      const card = await getRow(
        'SELECT * FROM digital_cards WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (!card) {
        throw new ValidationError('No active digital card found');
      }

      // Add funds to card
      const newBalance = parseFloat(card.balance) + parseFloat(amount);
      await update('digital_cards', card.id, {
        balance: newBalance
      });

      // Create transaction record
      await insert('transactions', {
        card_id: card.id,
        type: 'recharge',
        amount,
        payment_method: 'online',
        payment_gateway_transaction_id: paymentId,
        description: `Card recharge via online payment`,
        status: 'completed',
        processed_at: new Date()
      });

      return {
        card_id: card.id,
        previous_balance: card.balance,
        new_balance,
        amount_added: amount
      };

    } catch (error) {
      logError(error, { userId, amount, paymentId });
      throw error;
    }
  }

  // Get payment status
  async getPaymentStatus(paymentId, userId) {
    const payment = await getRow(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId]
    );

    if (!payment) {
      throw new ValidationError('Payment not found');
    }

    return {
      payment_id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      status: payment.status,
      created_at: payment.created_at,
      processed_at: payment.processed_at,
      gateway_response: payment.gateway_response ? JSON.parse(payment.gateway_response) : null
    };
  }

  // Get user's payment history
  async getPaymentHistory(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const payments = await query(
      `SELECT id, amount, currency, gateway, status, created_at, processed_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) as total FROM payments WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    return {
      payments: payments.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Refund payment
  async refundPayment(paymentId, userId, reason = 'Customer request') {
    const payment = await getRow(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2 AND status = $3',
      [paymentId, userId, 'completed']
    );

    if (!payment) {
      throw new ValidationError('Payment not found or cannot be refunded');
    }

    // Check if payment is recent (within 24 hours for auto-refund)
    const paymentTime = new Date(payment.processed_at);
    const now = new Date();
    const hoursDiff = (now - paymentTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      throw new ValidationError('Payment can only be refunded within 24 hours');
    }

    try {
      // Process refund through gateway
      let refundResult;
      switch (payment.gateway) {
        case 'stripe':
          refundResult = await this.processStripeRefund(payment.gateway_transaction_id, payment.amount);
          break;
        case 'bob':
          refundResult = await this.processBobRefund(payment.gateway_transaction_id, payment.amount);
          break;
        case 'bnb':
          refundResult = await this.processBnbRefund(payment.gateway_transaction_id, payment.amount);
          break;
        default:
          throw new ValidationError('Refunds not supported for this payment method');
      }

      // Deduct from card balance
      await this.deductCardBalanceOnRefund(userId, payment.amount);

      // Update payment status
      await update('payments', paymentId, {
        status: 'refunded',
        refund_id: refundResult.refund_id,
        refund_reason: reason,
        refunded_at: new Date()
      });

      logUserAction(userId, 'payment_refunded', {
        payment_id: paymentId,
        amount: payment.amount,
        reason,
        refund_id: refundResult.refund_id
      });

      return {
        payment_id: paymentId,
        refund_id: refundResult.refund_id,
        amount_refunded: payment.amount,
        reason
      };

    } catch (error) {
      logError(error, { paymentId, userId });
      throw new PaymentError('Refund processing failed');
    }
  }

  // Generate signature for Bank of Bhutan
  generateBobSignature(payload, secret) {
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((result, key) => {
        result[key] = payload[key];
        return result;
      }, {});

    const signatureString = Object.values(sortedPayload).join('') + secret;
    return crypto.createHash('sha256').update(signatureString).digest('hex');
  }

  // Generate HMAC signature for BNB
  generateHmacSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  // Process Stripe refund (implementation)
  async processStripeRefund(transactionId, amount) {
    // Implement Stripe refund logic
    return {
      refund_id: `refund_${uuidv4()}`,
      status: 'succeeded'
    };
  }

  // Process BOB refund (implementation)
  async processBobRefund(transactionId, amount) {
    // Implement BOB refund logic
    return {
      refund_id: `refund_${uuidv4()}`,
      status: 'succeeded'
    };
  }

  // Process BNB refund (implementation)
  async processBnbRefund(transactionId, amount) {
    // Implement BNB refund logic
    return {
      refund_id: `refund_${uuidv4()}`,
      status: 'succeeded'
    };
  }

  // Deduct card balance on refund
  async deductCardBalanceOnRefund(userId, amount) {
    const card = await getRow(
      'SELECT * FROM digital_cards WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (!card) {
      throw new ValidationError('No active digital card found');
    }

    if (card.balance < amount) {
      throw new ValidationError('Insufficient balance for refund');
    }

    const newBalance = parseFloat(card.balance) - parseFloat(amount);
    await update('digital_cards', card.id, {
      balance: newBalance
    });

    // Create refund transaction
    await insert('transactions', {
      card_id: card.id,
      type: 'refund',
      amount: -amount,
      payment_method: 'online',
      description: 'Refund for failed payment',
      status: 'completed',
      processed_at: new Date()
    });
  }
}

module.exports = new PaymentService();