const express = require('express');
const { protect, optionalAuth } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/schedules - Get bus schedules
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      schedules: []
    }
  });
}));

module.exports = router;