const { logger, logPerformance, createRequestLogger } = require('../utils/logger');

// Request logging middleware
const requestLogger = createRequestLogger();

// Rate limiting monitoring middleware
const rateLimitMonitor = (req, res, next) => {
  const start = Date.now();

  // Add rate limit headers
  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log if request is rate limited
    if (res.statusCode === 429) {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
    }

    // Log slow requests
    if (duration > 5000) { // 5 seconds
      logger.warn('Slow request detected', {
        url: req.originalUrl,
        method: req.method,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }
  });

  next();
};

// API usage tracking
const apiUsageTracker = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Track API endpoint usage
    logger.info('API endpoint accessed', {
      endpoint,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || null,
      timestamp: new Date().toISOString()
    });

    // Performance tracking for specific endpoints
    if (duration > 1000) {
      logPerformance(endpoint, duration, {
        statusCode: res.statusCode,
        ip: req.ip
      });
    }
  });

  next();
};

// Security event logger
const securityLogger = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
    /data:.*base64/i  // Base64 encoded attacks
  ];

  const checkSuspiciousActivity = (input) => {
    return suspiciousPatterns.some(pattern => pattern.test(input));
  };

  // Check URL parameters
  const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
  for (const [key, value] of urlParams) {
    if (checkSuspiciousActivity(value)) {
      logger.warn('Suspicious URL parameter detected', {
        ip: req.ip,
        url: req.originalUrl,
        parameter: key,
        value: value,
        userAgent: req.get('User-Agent')
      });
    }
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    const bodyStr = JSON.stringify(req.body);
    if (checkSuspiciousActivity(bodyStr)) {
      logger.warn('Suspicious request body detected', {
        ip: req.ip,
        url: req.originalUrl,
        body: req.body,
        userAgent: req.get('User-Agent')
      });
    }
  }

  // Check for unusual request patterns
  const unusualHeaders = [];
  const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];

  suspiciousHeaders.forEach(header => {
    if (req.get(header)) {
      const value = req.get(header);
      if (value.includes(',') && value.split(',').length > 3) {
        unusualHeaders.push({ header, value });
      }
    }
  });

  if (unusualHeaders.length > 0) {
    logger.warn('Unusual header patterns detected', {
      ip: req.ip,
      url: req.originalUrl,
      headers: unusualHeaders,
      userAgent: req.get('User-Agent')
    });
  }

  next();
};

// Database query logger
const dbQueryLogger = (queryFn) => {
  return async (...args) => {
    const start = Date.now();
    try {
      const result = await queryFn(...args);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn('Slow database query detected', {
          query: args[0],
          duration: `${duration}ms`,
          params: args[1] || []
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: args[0],
        duration: `${duration}ms`,
        params: args[1] || [],
        error: error.message
      });
      throw error;
    }
  };
};

// WebSocket connection logger
const wsLogger = (socket, next) => {
  const handshakeData = socket.handshake;

  logger.info('WebSocket connection attempt', {
    ip: handshakeData.address,
    userAgent: handshakeData.headers['user-agent'],
    query: handshakeData.query,
    timestamp: new Date().toISOString()
  });

  socket.on('connect', () => {
    logger.info('WebSocket connected', {
      socketId: socket.id,
      ip: socket.handshake.address,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', (reason) => {
    logger.info('WebSocket disconnected', {
      socketId: socket.id,
      reason,
      duration: Date.now() - socket.handshake.time,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('error', (error) => {
    logger.error('WebSocket error', {
      socketId: socket.id,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  });

  next();
};

module.exports = {
  requestLogger,
  rateLimitMonitor,
  apiUsageTracker,
  securityLogger,
  dbQueryLogger,
  wsLogger
};