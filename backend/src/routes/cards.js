const express = require('express');
const Joi = require('joi');
const cardService = require('../services/cardService');
const { protect, checkOwnership } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const { logUserAction } = require('../utils/logger');
const { getRow } = require('../config/database');

const router = express.Router();

// All card routes require authentication
router.use(protect);

// Validation schemas
const createCardSchema = Joi.object({
  card_type: Joi.string().valid('regular', 'student', 'disabled', 'senior').default('regular'),
  physical_card_number: Joi.string().length(16).optional(),
  link_physical_card: Joi.boolean().default(false),
  initial_balance: Joi.number().min(0).max(1000).default(0),
  student_id_proof: Joi.string().optional(),
  disability_proof: Joi.string().optional(),
  is_tourist_card: Joi.boolean().default(false)
});

const rechargeSchema = Joi.object({
  amount: Joi.number().min(10).max(5000).required(),
  payment_method: Joi.string().valid('mobile_wallet', 'bank_card', 'qr_code').required(),
  payment_details: Joi.object({
    transaction_id: Joi.string().required(),
    gateway: Joi.string().optional(),
    gateway_response: Joi.object().optional()
  }).required()
});

const validateCardSchema = Joi.object({
  card_number: Joi.string().length(16).required(),
  cvv: Joi.string().length(3).optional(),
  bus_id: Joi.string().uuid().optional(),
  amount: Joi.number().optional()
});

const deductFareSchema = Joi.object({
  card_id: Joi.string().uuid().required(),
  amount: Joi.number().min(0).required(),
  ride_id: Joi.string().uuid().optional(),
  bus_id: Joi.string().uuid().optional(),
  route_id: Joi.string().uuid().optional()
});

const updateCardTypeSchema = Joi.object({
  new_type: Joi.string().valid('regular', 'student', 'disabled', 'senior').required(),
  proof_documents: Joi.object({
    student_id: Joi.string().optional(),
    disability_proof: Joi.string().optional()
  }).optional()
});

// GET /api/cards - Get user's digital card
router.get('/', catchAsync(async (req, res) => {
  const card = await cardService.getUserCard(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      card
    }
  });
}));

// POST /api/cards - Create new digital card
router.post('/', catchAsync(async (req, res) => {
  const { error, value } = createCardSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const card = await cardService.createCard(req.user.id, value);

  res.status(201).json({
    success: true,
    message: 'Digital card created successfully',
    data: {
      card
    }
  });
}));

// GET /api/cards/qr - Generate QR code for card
router.get('/qr', catchAsync(async (req, res) => {
  const qrData = await cardService.generateCardQR(req.user.id);

  res.status(200).json({
    success: true,
    data: qrData
  });
}));

// POST /api/cards/recharge - Recharge card
router.post('/recharge', catchAsync(async (req, res) => {
  const { error, value } = rechargeSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await cardService.rechargeCard(
    req.user.id,
    value.amount,
    value.payment_method,
    value.payment_details
  );

  res.status(200).json({
    success: true,
    message: 'Card recharged successfully',
    data: result
  });
}));

// POST /api/cards/validate - Validate card (for bus drivers/system)
router.post('/validate', catchAsync(async (req, res) => {
  const { error, value } = validateCardSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const validation = await cardService.validateCard(
    value.card_number,
    value.cvv,
    value.bus_id,
    value.amount
  );

  res.status(200).json({
    success: true,
    data: validation
  });
}));

// POST /api/cards/deduct-fare - Deduct fare from card (internal API)
router.post('/deduct-fare', catchAsync(async (req, res) => {
  const { error, value } = deductFareSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  // This endpoint should be protected with additional authentication
  // For now, we'll allow any authenticated user (in production, this would be bus drivers/system)
  const result = await cardService.deductFare(
    value.card_id,
    value.amount,
    value.ride_id,
    value.bus_id,
    value.route_id
  );

  res.status(200).json({
    success: true,
    message: 'Fare deducted successfully',
    data: result
  });
}));

// GET /api/cards/transactions - Get card transaction history
router.get('/transactions', catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const transactions = await cardService.getCardTransactions(req.user.id, page, limit);

  res.status(200).json({
    success: true,
    data: transactions
  });
}));

// PUT /api/cards/type - Update card type
router.put('/type', catchAsync(async (req, res) => {
  const { error, value } = updateCardTypeSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const updatedCard = await cardService.updateCardType(
    req.user.id,
    value.new_type,
    value.proof_documents
  );

  res.status(200).json({
    success: true,
    message: 'Card type updated successfully',
    data: {
      card: updatedCard
    }
  });
}));

// GET /api/cards/stats - Get card statistics
router.get('/stats', catchAsync(async (req, res) => {
  const stats = await cardService.getCardStats(req.user.id);

  res.status(200).json({
    success: true,
    data: stats
  });
}));

// DELETE /api/cards - Deactivate card
router.delete('/', catchAsync(async (req, res) => {
  const result = await cardService.deactivateCard(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Card deactivated successfully',
    data: result
  });
}));

// POST /api/cards/:cardId/validate - Validate specific card by ID
router.post('/:cardId/validate', catchAsync(async (req, res) => {
  const { cardId } = req.params;

  // Get card by ID
  const card = await getRow(
    'SELECT digital_card_number FROM digital_cards WHERE id = $1 AND is_active = true',
    [cardId]
  );

  if (!card) {
    return res.status(404).json({
      success: false,
      error: 'Card not found'
    });
  }

  const { error, value } = validateCardSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const validation = await cardService.validateCard(
    card.digital_card_number,
    value.cvv,
    value.bus_id,
    value.amount
  );

  res.status(200).json({
    success: true,
    data: validation
  });
}));

module.exports = router;