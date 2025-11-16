const { getRow, getRows, query } = require('../config/database');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { logUserAction } = require('../utils/logger');

class RouteFinderService {
  constructor() {
    this.bhutanFareStructure = {
      smartCard: {
        baseFare: 5, // Nu 5
        perStopRate: 1 // Nu 1 per stop
      },
      cash: {
        baseFare: 10, // Nu 10
        perZoneRate: 5 // Nu 5 per zone
      },
      discounts: {
        regular: 0,
        student: 0.3, // 30%
        disabled: 0.2, // 20%
        senior: 0.1 // 10%
      }
    };
  }

  // Find routes from point A to point B
  async findRoutes(fromLat, fromLon, toLat, toLon, options = {}) {
    const {
      maxWalkingDistance = 800, // meters
      maxTransfers = 2,
      optimizeFor = 'time', // 'time', 'fare', 'transfers'
      departureTime = new Date(),
      userCardType = 'regular'
    } = options;

    if (!fromLat || !fromLon || !toLat || !toLon) {
      throw new ValidationError('Origin and destination coordinates are required');
    }

    // Find nearest stops to origin and destination
    const [fromStops, toStops] = await Promise.all([
      this.findNearestStops(fromLat, fromLon, maxWalkingDistance),
      this.findNearestStops(toLat, toLon, maxWalkingDistance)
    ]);

    if (fromStops.length === 0) {
      throw new ValidationError('No bus stops found near origin');
    }

    if (toStops.length === 0) {
      throw new ValidationError('No bus stops found near destination');
    }

    logUserAction(null, 'route_search_initiated', {
      from: { lat: fromLat, lon: fromLon },
      to: { lat: toLat, lon: toLon },
      options
    });

    // Find different route options
    const routeOptions = await this.findRouteOptions(
      fromStops,
      toStops,
      fromLat,
      fromLon,
      toLat,
      toLon,
      {
        maxTransfers,
        optimizeFor,
        departureTime,
        userCardType
      }
    );

    // Sort routes based on optimization criteria
    const sortedRoutes = this.sortRoutes(routeOptions, optimizeFor);

    return {
      search: {
        origin: { latitude: fromLat, longitude: fromLon },
        destination: { latitude: toLat, longitude: toLon },
        options,
        timestamp: new Date().toISOString()
      },
      routes: sortedRoutes.slice(0, 5), // Return top 5 routes
      summary: {
        totalFound: sortedRoutes.length,
        directRoutes: sortedRoutes.filter(r => r.segments.length === 3).length, // walk + bus + walk
        oneTransferRoutes: sortedRoutes.filter(r => r.segments.length === 5).length, // walk + bus + transfer + bus + walk
        averageTime: sortedRoutes.length > 0 ?
          Math.round(sortedRoutes.reduce((sum, r) => sum + r.durationMinutes, 0) / sortedRoutes.length) : 0,
        averageFare: sortedRoutes.length > 0 ?
          Math.round(sortedRoutes.reduce((sum, r) => sum + r.fare, 0) / sortedRoutes.length * 100) / 100 : 0
      }
    };
  }

  // Find nearest bus stops to a location
  async findNearestStops(lat, lon, maxDistance = 800) {
    const stops = await query(
      `SELECT bs.id, bs.name, bs.name_dz, bs.latitude, bs.longitude,
              bs.is_accessible, bs.shelter, bs.stop_type,
              ROUND(ST_Distance(
                ll_to_earth(bs.latitude, bs.longitude),
                ll_to_earth($1, $2)
              )) as distance_meters
       FROM bus_stops bs
       WHERE ST_DWithin(
         ll_to_earth(bs.latitude, bs.longitude),
         ll_to_earth($1, $2),
         $3
       )
       ORDER BY distance_meters
       LIMIT 10`,
      [lat, lon, maxDistance]
    );

    return stops.rows.map(stop => ({
      id: stop.id,
      name: stop.name,
      nameDz: stop.name_dz,
      latitude: parseFloat(stop.latitude),
      longitude: parseFloat(stop.longitude),
      distanceMeters: parseInt(stop.distance_meters),
      walkingTimeMinutes: Math.ceil(stop.distance_meters / 80), // Average walking speed 80m/min
      isAccessible: stop.is_accessible,
      hasShelter: stop.shelter,
      type: stop.stop_type
    }));
  }

  // Find different route options
  async findRouteOptions(fromStops, toStops, fromLat, fromLon, toLat, toLon, options) {
    const routeOptions = [];

    // 1. Direct routes (no transfers)
    for (const fromStop of fromStops.slice(0, 3)) { // Check top 3 nearest stops
      for (const toStop of toStops.slice(0, 3)) {
        const directRoutes = await this.findDirectRoutes(fromStop, toStop, options);
        routeOptions.push(...directRoutes);
      }
    }

    // 2. Routes with one transfer
    if (options.maxTransfers >= 1) {
      for (const fromStop of fromStops.slice(0, 2)) {
        for (const toStop of toStops.slice(0, 2)) {
          const transferRoutes = await this.findTransferRoutes(fromStop, toStop, options);
          routeOptions.push(...transferRoutes);
        }
      }
    }

    // 3. Routes with two transfers
    if (options.maxTransfers >= 2) {
      // Add more complex transfer logic if needed
    }

    // Remove duplicates and very similar routes
    return this.deduplicateRoutes(routeOptions);
  }

  // Find direct bus routes between two stops
  async findDirectRoutes(fromStop, toStop, options) {
    const directRoutes = await query(
      `SELECT DISTINCT r.id, r.route_number, r.route_name, r.base_fare, r.per_km_fare,
              rs_from.stop_order as from_stop_order,
              rs_to.stop_order as to_stop_order,
              (rs_to.stop_order - rs_from.stop_order) as stops_count,
              ROUND(ST_Distance(
                ll_to_earth($1, $2),
                ll_to_earth($3, $4)
              ) / 1000) as walking_distance_from_km,
              ROUND(ST_Distance(
                ll_to_earth($5, $6),
                ll_to_earth($7, $8)
              ) / 1000) as walking_distance_to_km
       FROM routes r
       JOIN route_stops rs_from ON r.id = rs_from.route_id
       JOIN route_stops rs_to ON r.id = rs_to.route_id
       WHERE r.is_active = true
             AND rs_from.stop_id = $9
             AND rs_to.stop_id = $10
             AND rs_to.stop_order > rs_from.stop_order
       ORDER BY stops_count`,
      [
        options.fromLat || fromStop.latitude, options.fromLon || fromStop.longitude,
        fromStop.latitude, fromStop.longitude,
        options.toLat || toStop.latitude, options.toLon || toStop.longitude,
        toStop.latitude, toStop.longitude,
        fromStop.id, toStop.id
      ]
    );

    return directRoutes.rows.map(route => {
      const fare = this.calculateFare(route.stops_count, 'smart_card', options.userCardType);
      const walkingTimeFrom = Math.ceil((route.walking_distance_from_km || 0) * 12); // 5 km/h walking
      const walkingTimeTo = Math.ceil((route.walking_distance_to_km || 0) * 12);
      const busTime = Math.ceil(route.stops_count * 2.5); // Average 2.5 minutes per stop

      return {
        id: `direct_${route.id}_${fromStop.id}_${toStop.id}`,
        type: 'direct',
        durationMinutes: walkingTimeFrom + busTime + walkingTimeTo,
        fare,
        transfers: 0,
        confidence: 0.9,
        segments: [
          {
            type: 'walk',
            from: { name: 'Your Location', lat: options.fromLat, lon: options.fromLon },
            to: { name: fromStop.name, lat: fromStop.latitude, lon: fromStop.longitude },
            durationMinutes: walkingTimeFrom,
            distanceMeters: Math.round((route.walking_distance_from_km || 0) * 1000)
          },
          {
            type: 'bus',
            route: {
              id: route.id,
              number: route.route_number,
              name: route.route_name
            },
            from: { name: fromStop.name, lat: fromStop.latitude, lon: fromStop.longitude },
            to: { name: toStop.name, lat: toStop.latitude, lon: toStop.longitude },
            durationMinutes: busTime,
            stops: route.stops_count,
            fare
          },
          {
            type: 'walk',
            from: { name: toStop.name, lat: toStop.latitude, lon: toStop.longitude },
            to: { name: 'Destination', lat: options.toLat, lon: options.toLon },
            durationMinutes: walkingTimeTo,
            distanceMeters: Math.round((route.walking_distance_to_km || 0) * 1000)
          }
        ]
      };
    });
  }

  // Find routes requiring transfers
  async findTransferRoutes(fromStop, toStop, options) {
    // Find all routes that pass through fromStop
    const fromRoutes = await query(
      `SELECT DISTINCT r.id, r.route_number, r.route_name
       FROM routes r
       JOIN route_stops rs ON r.id = rs.route_id
       WHERE r.is_active = true AND rs.stop_id = $1`,
      [fromStop.id]
    );

    // Find all routes that pass through toStop
    const toRoutes = await query(
      `SELECT DISTINCT r.id, r.route_number, r.route_name
       FROM routes r
       JOIN route_stops rs ON r.id = rs.route_id
       WHERE r.is_active = true AND rs.stop_id = $1`,
      [toStop.id]
    );

    const transferRoutes = [];

    // For each route from origin, find routes to destination with common stops
    for (const fromRoute of fromRoutes.rows) {
      for (const toRoute of toRoutes.rows) {
        if (fromRoute.id === toRoute.id) continue; // Skip direct routes

        // Find common transfer stops
        const transferStops = await query(
          `SELECT bs.id, bs.name, bs.latitude, bs.longitude,
                  rs_from.stop_order as from_stop_order,
                  rs_to.stop_order as to_stop_order,
                  ROUND(ST_Distance(
                    ll_to_earth($1, $2),
                    ll_to_earth(bs.latitude, bs.longitude)
                  ) / 1000) as distance_from_origin_km,
                  ROUND(ST_Distance(
                    ll_to_earth(bs.latitude, bs.longitude),
                    ll_to_earth($3, $4)
                  ) / 1000) as distance_to_dest_km
           FROM bus_stops bs
           JOIN route_stops rs_from ON bs.id = rs_from.stop_id AND rs_from.route_id = $5
           JOIN route_stops rs_to ON bs.id = rs_to.stop_id AND rs_to.route_id = $6
           WHERE rs_from.stop_order > (
             SELECT stop_order FROM route_stops WHERE route_id = $5 AND stop_id = $7
           )
           AND rs_to.stop_order > (
             SELECT stop_order FROM route_stops WHERE route_id = $6 AND stop_id = $8
           )
           ORDER BY (rs_from.stop_order + rs_to.stop_order)
           LIMIT 3`,
          [
            fromStop.latitude, fromStop.longitude,
            toStop.latitude, toStop.longitude,
            fromRoute.id, toRoute.id, fromStop.id, toStop.id
          ]
        );

        for (const transferStop of transferStops.rows) {
          const fare1 = this.calculateFare(
            transferStop.from_stop_order - 1, // Approximate stop count
            'smart_card',
            options.userCardType
          );
          const fare2 = this.calculateFare(
            transferStop.to_stop_order - 1, // Approximate stop count
            'smart_card',
            options.userCardType
          );
          const totalFare = fare1 + fare2;

          const walkingTimeFrom = fromStop.walkingTimeMinutes || 5;
          const walkingTimeTransfer = 8; // 8 minutes for transfer
          const walkingTimeTo = toStop.walkingTimeMinutes || 5;
          const busTime1 = Math.ceil((transferStop.from_stop_order - 1) * 2.5);
          const busTime2 = Math.ceil((transferStop.to_stop_order - 1) * 2.5);

          transferRoutes.push({
            id: `transfer_${fromRoute.id}_${toRoute.id}_${transferStop.id}`,
            type: 'transfer',
            durationMinutes: walkingTimeFrom + busTime1 + walkingTimeTransfer + busTime2 + walkingTimeTo,
            fare: totalFare,
            transfers: 1,
            confidence: 0.7,
            segments: [
              {
                type: 'walk',
                from: { name: 'Your Location', lat: options.fromLat, lon: options.fromLon },
                to: { name: fromStop.name, lat: fromStop.latitude, lon: fromStop.longitude },
                durationMinutes: walkingTimeFrom
              },
              {
                type: 'bus',
                route: { id: fromRoute.id, number: fromRoute.route_number, name: fromRoute.route_name },
                from: { name: fromStop.name, lat: fromStop.latitude, lon: fromStop.longitude },
                to: { name: transferStop.name, lat: transferStop.latitude, lon: transferStop.longitude },
                durationMinutes: busTime1,
                fare: fare1
              },
              {
                type: 'transfer',
                from: { name: transferStop.name, lat: transferStop.latitude, lon: transferStop.longitude },
                to: { name: transferStop.name, lat: transferStop.latitude, lon: transferStop.longitude },
                durationMinutes: walkingTimeTransfer,
                transferInfo: {
                  fromRoute: fromRoute.route_number,
                  toRoute: toRoute.route_number
                }
              },
              {
                type: 'bus',
                route: { id: toRoute.id, number: toRoute.route_number, name: toRoute.route_name },
                from: { name: transferStop.name, lat: transferStop.latitude, lon: transferStop.longitude },
                to: { name: toStop.name, lat: toStop.latitude, lon: toStop.longitude },
                durationMinutes: busTime2,
                fare: fare2
              },
              {
                type: 'walk',
                from: { name: toStop.name, lat: toStop.latitude, lon: toStop.longitude },
                to: { name: 'Destination', lat: options.toLat, lon: options.toLon },
                durationMinutes: walkingTimeTo
              }
            ]
          });
        }
      }
    }

    return transferRoutes;
  }

  // Calculate fare based on Bhutan fare structure
  calculateFare(stopsOrDistance, paymentMethod = 'smart_card', cardType = 'regular') {
    let baseFare, rate;

    if (paymentMethod === 'smart_card') {
      baseFare = this.bhutanFareStructure.smartCard.baseFare;
      rate = this.bhutanFareStructure.smartCard.perStopRate;
      const fare = baseFare + (stopsOrDistance * rate);
      return this.applyDiscount(fare, cardType);
    } else {
      baseFare = this.bhutanFareStructure.cash.baseFare;
      rate = this.bhutanFareStructure.cash.perZoneRate;
      // Convert stops to zones (approximately 3 stops = 1 zone)
      const zones = Math.ceil(stopsOrDistance / 3);
      const fare = baseFare + (zones * rate);
      return this.applyDiscount(fare, cardType);
    }
  }

  // Apply discount based on card type
  applyDiscount(fare, cardType) {
    const discount = this.bhutanFareStructure.discounts[cardType] || 0;
    const discountedFare = fare * (1 - discount);
    return Math.round(discountedFare * 100) / 100; // Round to 2 decimal places
  }

  // Sort routes based on optimization criteria
  sortRoutes(routes, optimizeFor) {
    return routes.sort((a, b) => {
      switch (optimizeFor) {
        case 'time':
          return a.durationMinutes - b.durationMinutes;
        case 'fare':
          return a.fare - b.fare;
        case 'transfers':
          return a.transfers - b.transfers;
        default:
          // Composite score (70% time, 20% transfers, 10% fare)
          const scoreA = (a.durationMinutes * 0.7) + (a.transfers * 20 * 0.2) + (a.fare * 0.1);
          const scoreB = (b.durationMinutes * 0.7) + (b.transfers * 20 * 0.2) + (b.fare * 0.1);
          return scoreA - scoreB;
      }
    });
  }

  // Remove duplicate routes
  deduplicateRoutes(routes) {
    const uniqueRoutes = [];
    const seen = new Set();

    for (const route of routes) {
      const key = `${route.segments.map(s => s.route?.number || s.type).join('-')}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRoutes.push(route);
      }
    }

    return uniqueRoutes;
  }

  // Get detailed route information
  async getRouteDetails(routeId) {
    // This would provide more detailed information about a specific route
    // including stops, timing, real-time bus positions, etc.

    const route = await getRow(
      `SELECT r.id, r.route_number, r.route_name, r.route_name_dz,
              r.start_point, r.end_point, r.total_distance_km,
              r.estimated_duration_minutes, r.base_fare, r.per_km_fare,
              r.service_type, r.is_active
       FROM routes r
       WHERE r.id = $1`,
      [routeId]
    );

    if (!route) {
      throw new NotFoundError('Route not found');
    }

    const stops = await getRows(
      `SELECT rs.stop_order, bs.id, bs.name, bs.name_dz,
              bs.latitude, bs.longitude, bs.is_accessible,
              rs.distance_from_start_km, rs.estimated_time_from_start_minutes,
              rs.is_mandatory_stop
       FROM route_stops rs
       JOIN bus_stops bs ON rs.stop_id = bs.id
       WHERE rs.route_id = $1
       ORDER BY rs.stop_order`,
      [routeId]
    );

    return {
      route: {
        id: route.id,
        number: route.route_number,
        name: route.route_name,
        nameDz: route.route_name_dz,
        startPoint: route.start_point,
        endPoint: route.end_point,
        distanceKm: route.total_distance_km,
        estimatedMinutes: route.estimated_duration_minutes,
        serviceType: route.service_type,
        isActive: route.is_active
      },
      stops: stops.rows.map(stop => ({
        order: stop.stop_order,
        id: stop.id,
        name: stop.name,
        nameDz: stop.name_dz,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude),
        isAccessible: stop.is_accessible,
        distanceFromStartKm: parseFloat(stop.distance_from_start_km),
        estimatedTimeFromStartMinutes: stop.estimated_time_from_start_minutes,
        isMandatoryStop: stop.is_mandatory_stop
      }))
    };
  }

  // Calculate fare with specific parameters
  async calculateRouteFare(fromStopId, toStopId, cardType = 'regular', paymentMethod = 'smart_card') {
    const stops = await query(
      `SELECT rs_from.stop_order as from_order, rs_to.stop_order as to_order
       FROM route_stops rs_from, route_stops rs_to
       WHERE rs_from.stop_id = $1 AND rs_to.stop_id = $2
             AND rs_from.route_id = rs_to.route_id
             AND rs_to.stop_order > rs_from.stop_order`,
      [fromStopId, toStopId]
    );

    if (stops.rows.length === 0) {
      throw new ValidationError('No direct route found between these stops');
    }

    const stopCount = stops.rows[0].to_order - stops.rows[0].from_order;
    const fare = this.calculateFare(stopCount, paymentMethod, cardType);

    return {
      fromStopId,
      toStopId,
      stopCount,
      paymentMethod,
      cardType,
      fare,
      currency: 'BTN'
    };
  }
}

module.exports = new RouteFinderService();