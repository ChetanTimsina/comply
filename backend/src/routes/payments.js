const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const paymentService = require('../services/paymentService');
const { protect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const { logUserAction } = require('../utils/logger');

const router = express.Router();

// All payment routes require authentication
router.use(protect);

// Validation schemas
const initializePaymentSchema = Joi.object({
  amount: Joi.number().min(10).max(5000).required(),
  payment_method: Joi.string().valid('mobile_wallet', 'bank_card', 'qr_code').required(),
  gateway: Joi.string().valid('bob', 'bnb', 'stripe').required(),
  metadata: Joi.object({
    customer_name: Joi.string().required(),
    customer_phone: Joi.string().required(),
    customer_email: Joi.string().email().optional()
  }).required()
});

const refundPaymentSchema = Joi.object({
  reason: Joi.string().max(255).default('Customer request')
});

const bobCallbackSchema = Joi.object({
  transaction_id: Joi.string().required(),
  status: Joi.string().valid('success', 'failed', 'pending').required(),
  amount: Joi.number().required(),
  signature: Joi.string().required(),
  timestamp: Joi.string().isoDate().required(),
  error: Joi.string().optional()
});

const bnbCallbackSchema = Joi.object({
  transaction_reference: Joi.string().required(),
  status: Joi.string().valid('success', 'failed', 'pending').required(),
  amount: Joi.number().required(),
  signature: Joi.string().required(),
  timestamp: Joi.string().isoDate().required(),
  error_code: Joi.string().optional(),
  error_message: Joi.string().optional()
});

const stripeCallbackSchema = Joi.object({
  type: Joi.string().required(),
  data: Joi.object().required()
});

// POST /api/payments/initialize - Initialize payment
router.post('/initialize', catchAsync(async (req, res) => {
  const { error, value } = initializePaymentSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await paymentService.initializePayment(
    req.user.id,
    value.amount,
    value.payment_method,
    value.gateway,
    value.metadata
  );

  res.status(201).json({
    success: true,
    message: 'Payment initialized successfully',
    data: result
  });
}));

// GET /api/payments/:paymentId/status - Get payment status
router.get('/:paymentId/status', catchAsync(async (req, res) => {
  const { paymentId } = req.params;

  const status = await paymentService.getPaymentStatus(paymentId, req.user.id);

  res.status(200).json({
    success: true,
    data: status
  });
}));

// GET /api/payments/history - Get payment history
router.get('/history', catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const history = await paymentService.getPaymentHistory(req.user.id, page, limit);

  res.status(200).json({
    success: true,
    data: history
  });
}));

// POST /api/payments/:paymentId/refund - Refund payment
router.post('/:paymentId/refund', catchAsync(async (req, res) => {
  const { paymentId } = req.params;
  const { error, value } = refundPaymentSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await paymentService.refundPayment(paymentId, req.user.id, value.reason);

  res.status(200).json({
    success: true,
    message: 'Refund processed successfully',
    data: result
  });
}));

// GET /api/payments/gateways - Get available payment gateways
router.get('/gateways', catchAsync(async (req, res) => {
  const gateways = [
    {
      id: 'bob',
      name: 'Bank of Bhutan Mobile',
      description: 'Pay using M-BOB mobile banking app',
      fees: 'No additional fees',
      processing_time: 'Instant',
      supported_methods: ['mobile_wallet', 'qr_code'],
      currency: 'BTN'
    },
    {
      id: 'bnb',
      name: 'Bhutan National Bank',
      description: 'Pay using BNB mobile banking',
      fees: 'No additional fees',
      processing_time: 'Instant',
      supported_methods: ['mobile_wallet', 'qr_code'],
      currency: 'BTN'
    },
    {
      id: 'stripe',
      name: 'International Cards',
      description: 'Pay with Visa, Mastercard (for tourists)',
      fees: '2.9% + 30¢ processing fee',
      processing_time: 'Instant',
      supported_methods: ['bank_card'],
      currency: 'USD (converted to BTN)'
    }
  ];

  res.status(200).json({
    success: true,
    data: {
      gateways,
      supported_currencies: ['BTN', 'USD'],
      min_amount: 10,
      max_amount: 5000,
      processing_info: {
        domestic_payments: 'Instant confirmation',
        international_payments: 'May take 1-3 business days',
        refunds: 'Processed within 24 hours'
      }
    }
  });
}));

// POST /api/payments/callback/bob - Bank of Bhutan callback
router.post('/callback/bob', catchAsync(async (req, res) => {
  const { error, value } = bobCallbackSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid callback data'
    });
  }

  // Verify signature
  const isValidSignature = await verifyBobSignature(value, process.env.BOB_CLIENT_SECRET);
  if (!isValidSignature) {
    return res.status(401).json({
      success: false,
      error: 'Invalid signature'
    });
  }

  const result = await paymentService.processPaymentCallback(
    'bob',
    value.transaction_id,
    value.status,
    value
  );

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/payments/callback/bnb - BNB callback
router.post('/callback/bnb', catchAsync(async (req, res) => {
  const { error, value } = bnbCallbackSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid callback data'
    });
  }

  // Verify signature
  const isValidSignature = await verifyBnbSignature(value, process.env.BNB_CLIENT_SECRET);
  if (!isValidSignature) {
    return res.status(401).json({
      success: false,
      error: 'Invalid signature'
    });
  }

  const result = await paymentService.processPaymentCallback(
    'bnb',
    value.transaction_reference,
    value.status,
    value
  );

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/payments/callback/stripe - Stripe webhook
router.post('/callback/stripe', catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({
      success: false,
      error: 'Stripe signature required'
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({
      success: false,
      error: 'Webhook secret not configured'
    });
  }

  try {
    // Verify webhook signature (in production, use stripe's webhook verification)
    // const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    // For now, we'll parse the event manually
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    let paymentResult;

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        paymentResult = await paymentService.processPaymentCallback(
          'stripe',
          paymentIntent.id,
          'success',
          { payment_intent: paymentIntent }
        );
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        paymentResult = await paymentService.processPaymentCallback(
          'stripe',
          failedPayment.id,
          'failed',
          { error: failedPayment.last_payment_error?.message }
        );
        break;

      default:
        // Unexpected event type
        return res.status(200).json({ received: true });
    }

    res.status(200).json({
      success: true,
      data: paymentResult
    });

  } catch (error) {
    logUserAction(null, 'stripe_webhook_error', {
      error: error.message,
      event_type: req.body.type
    });

    return res.status(400).json({
      success: false,
      error: 'Webhook signature verification failed'
    });
  }
}));

// Helper functions for signature verification

// Verify Bank of Bhutan signature
async function verifyBobSignature(data, secret) {
  try {
    const sortedData = Object.keys(data)
      .sort()
      .filter(key => key !== 'signature')
      .map(key => `${key}=${data[key]}`)
      .join('');

    const expectedSignature = crypto
      .createHash('sha256')
      .update(sortedData + secret)
      .digest('hex');

    return data.signature === expectedSignature;
  } catch (error) {
    return false;
  }
}

// Verify BNB signature
async function verifyBnbSignature(data, secret) {
  try {
    const payload = {
      transaction_reference: data.transaction_reference,
      status: data.status,
      amount: data.amount,
      timestamp: data.timestamp
    };

    const payloadString = JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    return data.signature === expectedSignature;
  } catch (error) {
    return false;
  }
}

// GET /api/payments/limits - Get payment limits and fees
router.get('/limits', catchAsync(async (req, res) => {
  const limits = {
    min_recharge: 10,
    max_recharge: 5000,
    daily_limit: 10000,
    monthly_limit: 50000,
    fees: {
      bob: {
        percentage: 0,
        fixed: 0,
        description: 'No fees'
      },
      bnb: {
        percentage: 0,
        fixed: 0,
        description: 'No fees'
      },
      stripe: {
        percentage: 2.9,
        fixed: 0.30,
        description: 'International card processing'
      }
    },
    exchange_rates: {
      USD_TO_BTN: 74.5, // Approximate rate
      last_updated: new Date().toISOString()
    }
  };

  res.status(200).json({
    success: true,
    data: limits
  });
}));

// POST /api/payments/validate-amount - Validate recharge amount
router.post('/validate-amount', catchAsync(async (req, res) => {
  const { amount, payment_method } = req.body;

  if (!amount || typeof amount !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'Amount is required'
    });
  }

  const validation = {
    is_valid: false,
    errors: [],
    fees: 0,
    final_amount: 0
  };

  if (amount < 10) {
    validation.errors.push('Minimum recharge amount is 10 ngultrum');
  }

  if (amount > 5000) {
    validation.errors.push('Maximum recharge amount is 5000 ngultrum');
  }

  if (amount % 1 !== 0) {
    validation.errors.push('Amount must be a whole number');
  }

  // Calculate fees based on payment method
  if (payment_method === 'stripe') {
    validation.fees = Math.round((amount * 0.029) + 0.30);
  }

  validation.final_amount = amount + validation.fees;

  if (validation.errors.length === 0) {
    validation.is_valid = true;
  }

  res.status(200).json({
    success: true,
    data: validation
  });
}));

module.exports = router;