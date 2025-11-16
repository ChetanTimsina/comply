const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const authService = require('../services/authService');
const { protect, createSendToken, refreshToken, authRateLimit } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const { logUserAction } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  full_name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().optional(),
  phone_number: Joi.string().pattern(/^(17|77)\d{6}$/).required(),
  password: Joi.string().min(6).required(),
  cid_number: Joi.string().pattern(/^[1-9]\d{10}$/).optional(),
  date_of_birth: Joi.date().optional(),
  preferred_language: Joi.string().valid('en', 'dz').default('en'),
  district: Joi.string().optional(),
  is_tourist: Joi.boolean().default(false),
  passport_number: Joi.string().when('is_tourist', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

const loginSchema = Joi.object({
  phone_number: Joi.string().pattern(/^(17|77)\d{6}$/).optional(),
  email: Joi.string().email().optional(),
  password: Joi.string().required()
}).xor('phone_number', 'email'); // Either phone_number or email, not both

const verifyOTPSchema = Joi.object({
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
});

const resendOTPSchema = Joi.object({
  type: Joi.string().valid('phone', 'email').required()
});

const forgotPasswordSchema = Joi.object({
  identifier: Joi.string().required() // Can be phone number or email
});

const resetPasswordSchema = Joi.object({
  identifier: Joi.string().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  new_password: Joi.string().min(6).required()
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(6).required()
});

const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required()
});

// Rate limiting for auth endpoints
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 registration requests per windowMs
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later'
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  message: {
    success: false,
    error: 'Too many login attempts, please try again later'
  }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 OTP requests per windowMs
  message: {
    success: false,
    error: 'Too many OTP requests, please try again later'
  }
});

// Routes

// POST /api/auth/register
router.post('/register', registerLimiter, catchAsync(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.register(value);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your phone number.',
    data: result
  });
}));

// POST /api/auth/login
router.post('/login', loginLimiter, catchAsync(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.login(value);

  // If verification is required, don't send tokens
  if (result.requires_verification) {
    return res.status(200).json({
      success: true,
      message: 'Login successful. Please verify your account.',
      data: {
        user: result.user,
        requires_verification: true,
        verification_type: result.verification_type
      }
    });
  }

  // Create and send tokens for fully verified users
  createSendToken(result.user, 200, res, 'Login successful');
}));

// POST /api/auth/verify-phone
router.post('/verify-phone', otpLimiter, catchAsync(async (req, res) => {
  const { error, value } = verifyOTPSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  // Get user ID from JWT token (if provided) or require user_id in body
  const userId = req.user?.id || req.body.user_id;
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'User ID is required'
    });
  }

  const result = await authService.verifyPhone(userId, value.otp);

  // Create and send tokens after successful verification
  createSendToken(result.user, 200, res, 'Phone number verified successfully');
}));

// POST /api/auth/resend-otp
router.post('/resend-otp', protect, otpLimiter, catchAsync(async (req, res) => {
  const { error, value } = resendOTPSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.resendOTP(req.user.id, value.type);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/auth/refresh-token
router.post('/refresh-token', catchAsync(async (req, res) => {
  const { error, value } = refreshTokenSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.refreshToken(value.refresh_token);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 forgot password requests per windowMs
  message: {
    success: false,
    error: 'Too many password reset requests, please try again later'
  }
}), catchAsync(async (req, res) => {
  const { error, value } = forgotPasswordSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.forgotPassword(value.identifier);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/auth/reset-password
router.post('/reset-password', catchAsync(async (req, res) => {
  const { error, value } = resetPasswordSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.resetPassword(value);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/auth/change-password
router.post('/change-password', protect, catchAsync(async (req, res) => {
  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const result = await authService.changePassword(req.user.id, value.current_password, value.new_password);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// POST /api/auth/logout
router.post('/logout', protect, catchAsync(async (req, res) => {
  const result = await authService.logout(req.user.id);

  // Clear cookies
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.cookie('refreshToken', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: result
  });
}));

// GET /api/auth/me - Get current user info
router.get('/me', protect, catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
}));

// GET /api/auth/check-auth - Check if user is authenticated
router.get('/check-auth', protect, catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      authenticated: true,
      user: {
        id: req.user.id,
        full_name: req.user.full_name,
        email: req.user.email,
        phone_number: req.user.phone_number
      }
    }
  });
}));

module.exports = router;