const express = require('express');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Bhutan Bus System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      buses: '/api/buses',
      routes: '/api/routes',
      cards: '/api/cards',
      payments: '/api/payments',
      rides: '/api/rides',
      users: '/api/users',
      notifications: '/api/notifications',
      admin: '/api/admin'
    }
  });
});

module.exports = router;