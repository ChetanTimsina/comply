const express = require('express');
const { adminProtect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All admin routes require admin authentication
router.use(adminProtect);

// GET /api/admin/dashboard - Admin dashboard
router.get('/dashboard', catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      dashboard: {}
    }
  });
}));

module.exports = router;