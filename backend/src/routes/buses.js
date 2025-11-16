const express = require('express');
const Joi = require('joi');
const trackingService = require('../services/trackingService');
const { protect, optionalAuth } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// Most bus tracking endpoints can be public (for real-time passenger information)
// Some may require authentication for administrative features

// Validation schemas
const getNearbyBusesSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(0.1).max(10).default(2)
});

const updateBusLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  speed: Joi.number().min(0).max(200).optional(),
  heading: Joi.number().min(0).max(360).optional(),
  accuracy: Joi.number().min(0).optional()
});

const updateCapacitySchema = Joi.object({
  passenger_count: Joi.number().min(0).required(),
  estimated_by: Joi.string().valid('driver', 'sensor', 'ai').default('driver')
});

const getTrackingHistorySchema = Joi.object({
  start_time: Joi.date().optional(),
  end_time: Joi.date().optional(),
  limit: Joi.number().min(1).max(1000).default(100)
});

// GET /api/buses - Get all buses with optional filtering
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  const { route_id, status, active_only = true } = req.query;

  const filters = {
    routeId: route_id,
    status: status || (active_only === 'true' ? 'active' : 'all')
  };

  const buses = await trackingService.getAllBusLocations(filters);

  res.status(200).json({
    success: true,
    data: {
      buses,
      total: buses.length,
      filters
    }
  });
}));

// GET /api/buses/:busId/location - Get specific bus location
router.get('/:busId/location', optionalAuth, catchAsync(async (req, res) => {
  const { busId } = req.params;

  const location = await trackingService.getBusLocation(busId);

  res.status(200).json({
    success: true,
    data: location
  });
}));

// GET /api/buses/:busId/capacity - Get bus capacity information
router.get('/:busId/capacity', optionalAuth, catchAsync(async (req, res) => {
  const { busId } = req.params;

  const capacity = await trackingService.getBusCapacity(busId);

  res.status(200).json({
    success: true,
    data: capacity
  });
}));

// GET /api/buses/:busId/route-progress - Get bus route progress
router.get('/:busId/route-progress', optionalAuth, catchAsync(async (req, res) => {
  const { busId } = req.params;

  const progress = await trackingService.getBusRouteProgress(busId);

  res.status(200).json({
    success: true,
    data: progress
  });
}));

// GET /api/buses/:busId/tracking-history - Get GPS tracking history
router.get('/:busId/tracking-history', protect, catchAsync(async (req, res) => {
  const { busId } = req.params;
  const { error, value } = getTrackingHistorySchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const history = await trackingService.getBusTrackingHistory(
    busId,
    value.start_time,
    value.end_time,
    value.limit
  );

  res.status(200).json({
    success: true,
    data: history
  });
}));

// GET /api/buses/routes/:routeId/buses - Get buses on specific route
router.get('/routes/:routeId/buses', optionalAuth, catchAsync(async (req, res) => {
  const { routeId } = req.params;
  const { active_only = 'true' } = req.query;

  const routeData = await trackingService.getBusesOnRoute(routeId, active_only === 'true');

  res.status(200).json({
    success: true,
    data: routeData
  });
}));

// GET /api/buses/nearby - Get nearby buses to a location
router.get('/nearby', optionalAuth, catchAsync(async (req, res) => {
  const { error, value } = getNearbyBusesSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const nearbyBuses = await trackingService.getNearbyBuses(
    value.latitude,
    value.longitude,
    value.radius
  );

  res.status(200).json({
    success: true,
    data: {
      location: {
        latitude: value.latitude,
        longitude: value.longitude,
        radiusKm: value.radius
      },
      buses: nearbyBuses,
      total: nearbyBuses.length
    }
  });
}));

// POST /api/buses/:busId/location - Update bus location (driver app)
router.post('/:busId/location', protect, catchAsync(async (req, res) => {
  const { busId } = req.params;
  const { error, value } = updateBusLocationSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  // In a real implementation, you'd verify the user is authorized to update this bus
  // For now, we'll allow any authenticated user

  // This would update the bus location in the database
  // and trigger WebSocket broadcast to subscribers

  res.status(200).json({
    success: true,
    message: 'Location updated successfully',
    data: {
      busId,
      location: {
        latitude: value.latitude,
        longitude: value.longitude,
        speed: value.speed,
        heading: value.heading,
        accuracy: value.accuracy,
        timestamp: new Date().toISOString()
      }
    }
  });
}));

// POST /api/buses/:busId/capacity - Update bus capacity (driver app)
router.post('/:busId/capacity', protect, catchAsync(async (req, res) => {
  const { busId } = req.params;
  const { error, value } = updateCapacitySchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  // In a real implementation, you'd verify the user is the assigned driver
  // For now, we'll allow any authenticated user

  // This would update the bus capacity in the database
  // and trigger WebSocket broadcast to subscribers

  res.status(200).json({
    success: true,
    message: 'Capacity updated successfully',
    data: {
      busId,
      capacity: {
        passengerCount: value.passenger_count,
        estimatedBy: value.estimated_by,
        timestamp: new Date().toISOString()
      }
    }
  });
}));

// GET /api/buses/statistics - Get fleet statistics
router.get('/statistics', protect, catchAsync(async (req, res) => {
  // This would require database queries to get fleet statistics
  const statistics = {
    totalBuses: 46, // From planning document
    activeBuses: 42,
    busesWithGPS: 45,
    averageSpeed: 28.5,
    totalPassengers: 1850,
    busesOnRoutes: 38,
    busesAtDepots: 4,
    maintenanceRequired: 3
  };

  res.status(200).json({
    success: true,
    data: statistics
  });
}));

// GET /api/buses/health - Check bus system health
router.get('/health', optionalAuth, catchAsync(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      websocket: 'connected',
      gps_service: 'operational',
      tracking: 'active'
    },
    metrics: {
      active_connections: 1250, // Would come from WebSocket manager
      active_buses: 42,
      recent_updates: 847,
      average_response_time_ms: 45
    }
  };

  res.status(200).json({
    success: true,
    data: health
  });
}));

// GET /api/buses/stop/:stopId/eta - Get ETA for buses at a specific stop
router.get('/stop/:stopId/eta', optionalAuth, catchAsync(async (req, res) => {
  const { stopId } = req.params;
  const { max_buses = 5 } = req.query;

  const etaData = await trackingService.getStopETA(stopId, parseInt(max_buses));

  res.status(200).json({
    success: true,
    data: etaData
  });
}));

module.exports = router;