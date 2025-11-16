const { logger, logError } = require('../utils/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class PaymentError extends AppError {
  constructor(message = 'Payment failed') {
    super(message, 402);
    this.name = 'PaymentError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service unavailable') {
    super(message, 502);
    this.name = 'ExternalServiceError';
  }
}

// Handle Joi validation errors
const handleJoiError = (error) => {
  const details = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value
  }));

  return new ValidationError('Validation failed', details);
};

// Handle PostgreSQL errors
const handlePostgresError = (error) => {
  switch (error.code) {
    case '23505': // Unique violation
      const match = error.detail.match(/Key \((.*?)\)=\((.*?)\) already exists/);
      const field = match ? match[1] : 'field';
      return new ConflictError(`${field} already exists`);

    case '23503': // Foreign key violation
      return new ValidationError('Referenced resource does not exist');

    case '23502': // Not null violation
      return new ValidationError('Required field is missing');

    case '23514': // Check violation
      return new ValidationError('Invalid data provided');

    case '28P01': // Invalid authentication
      return new DatabaseError('Database authentication failed');

    case 'ECONNREFUSED':
      return new DatabaseError('Database connection refused');

    case 'ETIMEDOUT':
      return new DatabaseError('Database connection timeout');

    default:
      return new DatabaseError('Database operation failed');
  }
};

// Handle JWT errors
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  return new AuthenticationError('Token validation failed');
};

// Handle Redis errors
const handleRedisError = (error) => {
  if (error.code === 'ECONNREFUSED') {
    logger.warn('Redis connection refused - continuing without cache');
    return null; // Continue without Redis
  }
  if (error.code === 'ETIMEDOUT') {
    logger.warn('Redis connection timeout - continuing without cache');
    return null; // Continue without Redis
  }
  return new ExternalServiceError('Cache service unavailable');
};

// Handle file upload errors
const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File too large');
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files');
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Unexpected file field');
  }
  return new ValidationError('File upload failed');
};

// Development error response
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err.message,
    stack: err.stack,
    details: err.details || null,
    name: err.name
  });
};

// Production error response
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || null
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Programming error:', err);

    res.status(500).json({
      success: false,
      error: 'Something went wrong',
      details: null
    });
  }
};

// Main error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log the error
  logError(err, {
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip
  });

  // Handle different error types
  if (err.name === 'ValidationError' && err.isJoi) {
    error = handleJoiError(err);
  } else if (err.code?.startsWith('23')) {
    error = handlePostgresError(err);
  } else if (err.name?.includes('JsonWebToken') || err.name?.includes('Token')) {
    error = handleJWTError(err);
  } else if (err.code?.includes('ECONN') || err.code?.includes('ETIMEDOUT')) {
    error = handleRedisError(err) || error;
  } else if (err.code?.startsWith('LIMIT_')) {
    error = handleMulterError(err);
  }

  // Ensure error has statusCode
  if (!error.statusCode) {
    error.statusCode = 500;
    error.status = 'error';
  }

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  errorHandler,
  catchAsync,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PaymentError,
  DatabaseError,
  ExternalServiceError
};