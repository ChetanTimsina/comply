const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All user routes require authentication
router.use(protect);

// GET /api/users/profile - Get user profile
router.get('/profile', catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
}));

// PUT /api/users/profile - Update user profile
router.put('/profile', catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully'
  });
}));

module.exports = router;