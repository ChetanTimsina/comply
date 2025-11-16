const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'bhutan-bus-system' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log')
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Production-specific configuration
if (process.env.NODE_ENV === 'production') {
  // Add external logging service if needed
  // Example: Loggly, Papertrail, etc.
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'production.log'),
    level: 'warn',
    maxsize: 10485760, // 10MB
    maxFiles: 20,
    tailable: true
  }));
}

// Utility methods for structured logging
const logBusTracking = (busId, latitude, longitude, speed, timestamp) => {
  logger.info('Bus location updated', {
    type: 'bus_tracking',
    busId,
    latitude,
    longitude,
    speed,
    timestamp: new Date(timestamp).toISOString()
  });
};

const logPaymentTransaction = (transactionId, userId, amount, paymentMethod, status) => {
  logger.info('Payment transaction', {
    type: 'payment',
    transactionId,
    userId,
    amount,
    paymentMethod,
    status,
    timestamp: new Date().toISOString()
  });
};

const logUserAction = (userId, action, details = {}) => {
  logger.info('User action', {
    type: 'user_action',
    userId,
    action,
    details,
    timestamp: new Date().toISOString()
  });
};

const logSystemEvent = (event, details = {}) => {
  logger.info('System event', {
    type: 'system_event',
    event,
    details,
    timestamp: new Date().toISOString()
  });
};

const logSecurityEvent = (event, details = {}) => {
  logger.warn('Security event', {
    type: 'security',
    event,
    details,
    timestamp: new Date().toISOString()
  });
};

const logError = (error, context = {}) => {
  logger.error('Application error', {
    type: 'error',
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

const logPerformance = (operation, duration, details = {}) => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  logger.log(level, 'Performance metric', {
    type: 'performance',
    operation,
    duration: `${duration}ms`,
    details,
    timestamp: new Date().toISOString()
  });
};

// Request logger middleware helper
const createRequestLogger = () => {
  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        type: 'http_request',
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: req.user?.id || null,
        timestamp: new Date().toISOString()
      };

      if (res.statusCode >= 400) {
        logger.warn('HTTP request error', logData);
      } else {
        logger.info('HTTP request', logData);
      }

      logPerformance(`HTTP ${req.method} ${req.originalUrl}`, duration, {
        statusCode: res.statusCode,
        responseSize: res.get('Content-Length')
      });
    });

    next();
  };
};

module.exports = {
  logger,
  logBusTracking,
  logPaymentTransaction,
  logUserAction,
  logSystemEvent,
  logSecurityEvent,
  logError,
  logPerformance,
  createRequestLogger
};