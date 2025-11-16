const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { getRow } = require('../config/database');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

// Sign JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m'
  });
};

// Sign refresh token
const signRefreshToken = (id) => {
  return jwt.sign({ id, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
  });
};

// Create and send token response
const createSendToken = (user, statusCode, res, message = 'Success') => {
  const token = signToken(user.id);
  const refreshToken = signRefreshToken(user.id);

  // Remove password from output
  user.password_hash = undefined;

  // Cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 15) * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    expires: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    )
  });

  res.status(statusCode).json({
    success: true,
    message,
    data: {
      user,
      token,
      refreshToken,
      expiresIn: process.env.JWT_EXPIRE || '15m'
    }
  });
};

// Verify JWT token
const verifyToken = async (token) => {
  return promisify(jwt.verify)(token, process.env.JWT_SECRET);
};

// Verify refresh token
const verifyRefreshToken = async (token) => {
  return promisify(jwt.verify)(token, process.env.JWT_REFRESH_SECRET);
};

// Authentication middleware - protect routes
const protect = async (req, res, next) => {
  try {
    // 1) Get token and check if it's there
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return next(new AuthenticationError('Please log in to get access'));
    }

    // 2) Verification token
    const decoded = await verifyToken(token);

    // 3) Check if user still exists
    const user = await getRow(
      'SELECT id, full_name, email, phone_number, is_active, email_verified, phone_verified FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (!user) {
      return next(new AuthenticationError('The user belonging to this token no longer exists'));
    }

    // 4) Check if user changed password after the token was issued
    // This would require adding password_changed_at column to users table
    // const passwordChanged = await user.changedPasswordAfter(decoded.iat);
    // if (passwordChanged) {
    //   return next(new AuthenticationError('User recently changed password! Please log in again'));
    // }

    // Grant access to protected route
    req.user = user;
    next();
  } catch (error) {
    return next(new AuthenticationError('Invalid token'));
  }
};

// Authorization middleware - restrict access by role
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Please log in to get access'));
    }

    // Check user's roles (assuming user has roles array)
    // For now, we'll use a simple admin check
    const userRoles = req.user.roles || [];
    const hasPermission = roles.some(role => userRoles.includes(role));

    if (!hasPermission) {
      return next(new AuthorizationError('You do not have permission to perform this action'));
    }

    next();
  };
};

// Admin authentication middleware
const adminProtect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AuthenticationError('Please log in as admin to get access'));
    }

    const decoded = await verifyToken(token);

    const admin = await getRow(
      'SELECT id, username, email, role, is_active, permissions FROM admin_users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (!admin) {
      return next(new AuthenticationError('The admin belonging to this token no longer exists'));
    }

    req.admin = admin;
    next();
  } catch (error) {
    return next(new AuthenticationError('Invalid admin token'));
  }
};

// Admin role restriction
const adminRestrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return next(new AuthenticationError('Please log in as admin to get access'));
    }

    if (!roles.includes(req.admin.role)) {
      return next(new AuthorizationError('You do not have admin permission to perform this action'));
    }

    next();
  };
};

// Optional authentication - doesn't throw error if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (token) {
      const decoded = await verifyToken(token);
      const user = await getRow(
        'SELECT id, full_name, email, phone_number, is_active FROM users WHERE id = $1 AND is_active = true',
        [decoded.id]
      );

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Don't throw error, just continue without user
    next();
  }
};

// Check if user owns the resource
const checkOwnership = (resourceField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Please log in to get access'));
    }

    // For admin users, skip ownership check
    if (req.user.roles && req.user.roles.includes('admin')) {
      return next();
    }

    // Check if user owns the resource
    const resourceId = req.params.id || req.params.userId || req.body[resourceField];

    if (req.user.id !== resourceId && req.user.id !== req.body.user_id) {
      return next(new AuthorizationError('You can only access your own resources'));
    }

    next();
  };
};

// Rate limiting for auth endpoints
const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const userAttempts = attempts.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > userAttempts.resetTime) {
      userAttempts.count = 0;
      userAttempts.resetTime = now + windowMs;
    }

    userAttempts.count++;
    attempts.set(key, userAttempts);

    if (userAttempts.count > maxAttempts) {
      return res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again later.',
        retryAfter: Math.ceil((userAttempts.resetTime - now) / 1000)
      });
    }

    next();
  };
};

// Validate email/phone verification
const requireVerification = (type = 'both') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Please log in to get access'));
    }

    if (type === 'email' && !req.user.email_verified) {
      return next(new AuthenticationError('Please verify your email address'));
    }

    if (type === 'phone' && !req.user.phone_verified) {
      return next(new AuthenticationError('Please verify your phone number'));
    }

    if (type === 'both' && (!req.user.email_verified || !req.user.phone_verified)) {
      return next(new AuthenticationError('Please verify your email and phone number'));
    }

    next();
  };
};

module.exports = {
  signToken,
  signRefreshToken,
  verifyToken,
  verifyRefreshToken,
  createSendToken,
  protect,
  adminProtect,
  optionalAuth,
  restrictTo,
  adminRestrictTo,
  checkOwnership,
  authRateLimit,
  requireVerification
};