const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

router.use(protect);

// GET /api/notifications - Get user notifications
router.get('/', catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      notifications: []
    }
  });
}));

module.exports = router;