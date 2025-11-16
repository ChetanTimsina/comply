const express = require('express');
const Joi = require('joi');
const routeFinderService = require('../services/routeFinderService');
const { protect, optionalAuth } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const { getRow, query } = require('../config/database');

const router = express.Router();

// Validation schemas
const findRoutesSchema = Joi.object({
  from_lat: Joi.number().min(-90).max(90).required(),
  from_lon: Joi.number().min(-180).max(180).required(),
  to_lat: Joi.number().min(-90).max(90).required(),
  to_lon: Joi.number().min(-180).max(180).required(),
  max_walking_distance: Joi.number().min(100).max(2000).default(800),
  max_transfers: Joi.number().min(0).max(3).default(2),
  optimize_for: Joi.string().valid('time', 'fare', 'transfers').default('time'),
  departure_time: Joi.date().optional(),
  user_card_type: Joi.string().valid('regular', 'student', 'disabled', 'senior').default('regular')
});

const calculateFareSchema = Joi.object({
  from_stop_id: Joi.string().uuid().required(),
  to_stop_id: Joi.string().uuid().required(),
  card_type: Joi.string().valid('regular', 'student', 'disabled', 'senior').default('regular'),
  payment_method: Joi.string().valid('smart_card', 'cash').default('smart_card')
});

// POST /api/routes/find - Find routes between two points
router.post('/find', optionalAuth, catchAsync(async (req, res) => {
  const { error, value } = findRoutesSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const routeResults = await routeFinderService.findRoutes(
    value.from_lat,
    value.from_lon,
    value.to_lat,
    value.to_lon,
    {
      maxWalkingDistance: value.max_walking_distance,
      maxTransfers: value.max_transfers,
      optimizeFor: value.optimize_for,
      departureTime: value.departure_time,
      userCardType: value.user_card_type
    }
  );

  res.status(200).json({
    success: true,
    data: routeResults
  });
}));

// GET /api/routes/:routeId - Get detailed route information
router.get('/:routeId', optionalAuth, catchAsync(async (req, res) => {
  const { routeId } = req.params;

  const routeDetails = await routeFinderService.getRouteDetails(routeId);

  res.status(200).json({
    success: true,
    data: routeDetails
  });
}));

// POST /api/routes/calculate-fare - Calculate fare between two stops
router.post('/calculate-fare', optionalAuth, catchAsync(async (req, res) => {
  const { error, value } = calculateFareSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const fareInfo = await routeFinderService.calculateRouteFare(
    value.from_stop_id,
    value.to_stop_id,
    value.card_type,
    value.payment_method
  );

  res.status(200).json({
    success: true,
    data: fareInfo
  });
}));

// GET /api/routes - Get all routes with basic information
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  const { active_only = 'true', service_type } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (active_only === 'true') {
    whereClause += ' AND is_active = true';
  }

  if (service_type) {
    whereClause += ' AND service_type = $' + (params.length + 1);
    params.push(service_type);
  }

  const routes = await query(
    `SELECT id, route_number, route_name, route_name_dz,
            start_point, end_point, total_distance_km,
            estimated_duration_minutes, base_fare, service_type,
            is_active
     FROM routes
     ${whereClause}
     ORDER BY route_number`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      routes: routes.rows,
      total: routes.rows.length,
      filters: {
        activeOnly: active_only === 'true',
        serviceType: service_type
      }
    }
  });
}));

// GET /api/routes/search - Search routes by name or number
router.get('/search', optionalAuth, catchAsync(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Search query must be at least 2 characters long'
    });
  }

  const searchTerm = `%${q.trim()}%`;
  const routes = await query(
    `SELECT id, route_number, route_name, route_name_dz,
            start_point, end_point, service_type, is_active
     FROM routes
     WHERE (route_number ILIKE $1 OR route_name ILIKE $1 OR route_name_dz ILIKE $1)
           AND is_active = true
     ORDER BY route_number
     LIMIT $2`,
    [searchTerm, parseInt(limit)]
  );

  res.status(200).json({
    success: true,
    data: {
      query: q.trim(),
      routes: routes.rows,
      total: routes.rows.length
    }
  });
}));

// GET /api/routes/:routeId/stops - Get all stops for a specific route
router.get('/:routeId/stops', optionalAuth, catchAsync(async (req, res) => {
  const { routeId } = req.params;

  // Verify route exists
  const route = await getRow(
    'SELECT id, route_number, route_name FROM routes WHERE id = $1 AND is_active = true',
    [routeId]
  );

  if (!route) {
    return res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  }

  const stops = await query(
    `SELECT rs.stop_order, bs.id, bs.name, bs.name_dz,
            bs.latitude, bs.longitude, bs.is_accessible,
            bs.shelter, bs.stop_type, bs.landmark,
            rs.distance_from_start_km, rs.estimated_time_from_start_minutes,
            rs.is_mandatory_stop
     FROM route_stops rs
     JOIN bus_stops bs ON rs.stop_id = bs.id
     WHERE rs.route_id = $1
     ORDER BY rs.stop_order`,
    [routeId]
  );

  res.status(200).json({
    success: true,
    data: {
      route: {
        id: route.id,
        number: route.route_number,
        name: route.route_name
      },
      stops: stops.rows.map(stop => ({
        order: stop.stop_order,
        id: stop.id,
        name: stop.name,
        nameDz: stop.name_dz,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude),
        isAccessible: stop.is_accessible,
        hasShelter: stop.shelter,
        type: stop.stop_type,
        landmark: stop.landmark,
        distanceFromStartKm: parseFloat(stop.distance_from_start_km),
        estimatedTimeFromStartMinutes: stop.estimated_time_from_start_minutes,
        isMandatoryStop: stop.is_mandatory_stop
      }))
    }
  });
}));

// GET /api/routes/fares/info - Get fare structure information
router.get('/fares/info', optionalAuth, catchAsync(async (req, res) => {
  const fareInfo = {
    currency: {
      code: 'BTN',
      symbol: 'Nu',
      name: 'Bhutanese Ngultrum'
    },
    smartCard: {
      baseFare: 5,
      perStopRate: 1,
      description: 'Base fare of Nu 5 + Nu 1 per stop'
    },
    cash: {
      baseFare: 10,
      perZoneRate: 5,
      description: 'Base fare of Nu 10 + Nu 5 per zone (approximately 3 stops)'
    },
    discounts: {
      regular: { percentage: 0, description: 'No discount' },
      student: { percentage: 30, description: '30% discount with valid student ID' },
      disabled: { percentage: 20, description: '20% discount with disability certificate' },
      senior: { percentage: 10, description: '10% discount for citizens 65+ years' }
    },
    examples: [
      {
        from: 'Memorial Chorten',
        to: 'Clock Tower',
        stops: 5,
        smartCardRegular: 10,
        smartCardStudent: 7,
        cashRegular: 15,
        cashStudent: 10.5
      }
    ]
  };

  res.status(200).json({
    success: true,
    data: fareInfo
  });
}));

// GET /api/routes/popular - Get popular routes based on usage
router.get('/popular', optionalAuth, catchAsync(async (req, res) => {
  // This would typically be calculated from ride history data
  // For now, return some example popular routes
  const popularRoutes = [
    {
      routeId: 'example-route-1',
      routeNumber: '12',
      routeName: 'Memorial Chorten - Clock Tower',
      dailyRides: 1250,
      averageRating: 4.2,
      peakHours: ['07:00-09:00', '17:00-19:00']
    },
    {
      routeId: 'example-route-2',
      routeNumber: '8',
      routeName: 'Thimphu Town - Motithang',
      dailyRides: 980,
      averageRating: 4.0,
      peakHours: ['08:00-09:00', '16:00-18:00']
    },
    {
      routeId: 'example-route-3',
      routeNumber: '15',
      routeName: 'Changlimithang - Babesa',
      dailyRides: 856,
      averageRating: 3.8,
      peakHours: ['07:30-09:30', '17:30-19:30']
    }
  ];

  res.status(200).json({
    success: true,
    data: {
      routes: popularRoutes,
      lastUpdated: new Date().toISOString()
    }
  });
}));

// GET /api/routes/nearby/:lat/:lon - Get routes near a location
router.get('/nearby/:lat/:lon', optionalAuth, catchAsync(async (req, res) => {
  const { lat, lon } = req.params;
  const { radius = 500 } = req.query;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid coordinates'
    });
  }

  const routes = await query(
    `SELECT DISTINCT r.id, r.route_number, r.route_name, r.service_type,
            ROUND(AVG(ST_Distance(
              ll_to_earth($1, $2),
              ll_to_earth(bs.latitude, bs.longitude)
            )) / 1000) as average_distance_km,
            COUNT(*) as stops_nearby
     FROM routes r
     JOIN route_stops rs ON r.id = rs.route_id
     JOIN bus_stops bs ON rs.stop_id = bs.id
     WHERE r.is_active = true
           AND ST_DWithin(
             ll_to_earth(bs.latitude, bs.longitude),
             ll_to_earth($1, $2),
             $3
           )
     GROUP BY r.id, r.route_number, r.route_name, r.service_type
     HAVING COUNT(*) > 0
     ORDER BY average_distance_km
     LIMIT 10`,
    [latitude, longitude, parseInt(radius)]
  );

  res.status(200).json({
    success: true,
    data: {
      location: { latitude, longitude, radiusMeters: parseInt(radius) },
      routes: routes.rows.map(route => ({
        id: route.id,
        number: route.route_number,
        name: route.route_name,
        serviceType: route.service_type,
        averageDistanceKm: parseFloat(route.average_distance_km),
        nearbyStops: parseInt(route.stops_nearby)
      }))
    }
  });
});

module.exports = router;