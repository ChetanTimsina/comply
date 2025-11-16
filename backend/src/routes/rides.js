const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

router.use(protect);

// GET /api/rides/history - Get ride history
router.get('/history', catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      rides: [],
      pagination: {}
    }
  });
}));

module.exports = router;