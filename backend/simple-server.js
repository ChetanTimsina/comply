const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Bhutan Bus System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic API routes
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    data: {
      version: '1.0.0',
      features: [
        'User Authentication',
        'Digital Bus Card',
        'Real-time Tracking',
        'Route Finder',
        'Fare Calculator',
        'SOS Safety Features',
        'Payment Integration'
      ]
    }
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚌 Bhutan Bus System API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/api/test`);
  console.log(`🚀 Ready to serve the people of Bhutan!`);
});

module.exports = app;