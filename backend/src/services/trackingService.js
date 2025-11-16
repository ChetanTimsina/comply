const { getRow, getRows, query } = require('../config/database');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { logBusTracking, logUserAction } = require('../utils/logger');

class TrackingService {
  // Get current location of a specific bus
  async getBusLocation(busId) {
    const bus = await getRow(
      `SELECT b.id, b.bus_number, b.registration_number,
              b.current_latitude, b.current_longitude, b.current_speed_kmh,
              b.current_heading, b.last_gps_update, b.capacity,
              d.full_name as driver_name, d.phone_number as driver_phone,
              r.route_number, r.route_name
       FROM buses b
       LEFT JOIN drivers d ON b.current_driver_id = d.id
       LEFT JOIN routes r ON b.current_route_id = r.id
       WHERE b.id = $1 AND b.is_active = true`,
      [busId]
    );

    if (!bus) {
      throw new NotFoundError('Bus not found or inactive');
    }

    // Check if location data is recent (within last 5 minutes)
    if (!bus.current_latitude || !bus.current_longitude) {
      return {
        busId: bus.id,
        busNumber: bus.bus_number,
        status: 'offline',
        message: 'No GPS data available',
        lastUpdate: bus.last_gps_update
      };
    }

    const now = new Date();
    const lastUpdate = new Date(bus.last_gps_update);
    const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);

    let status = 'active';
    let message = 'Real-time tracking active';

    if (minutesSinceUpdate > 5) {
      status = 'offline';
      message = 'GPS signal lost';
    } else if (minutesSinceUpdate > 2) {
      status = 'stale';
      message = 'Data may be outdated';
    }

    return {
      busId: bus.id,
      busNumber: bus.bus_number,
      registrationNumber: bus.registration_number,
      status,
      message,
      latitude: parseFloat(bus.current_latitude),
      longitude: parseFloat(bus.current_longitude),
      speed: bus.current_speed_kmh ? parseFloat(bus.current_speed_kmh) : null,
      heading: bus.current_heading ? parseFloat(bus.current_heading) : null,
      lastUpdate: bus.last_gps_update,
      driver: bus.driver_name ? {
        name: bus.driver_name,
        phone: bus.driver_phone
      } : null,
      route: bus.route_number ? {
        number: bus.route_number,
        name: bus.route_name
      } : null,
      capacity: bus.capacity
    };
  }

  // Get all active buses with their current locations
  async getAllBusLocations(filters = {}) {
    const { routeId, status = 'active' } = filters;

    let whereClause = 'WHERE b.is_active = true';
    const params = [];

    if (routeId) {
      whereClause += ' AND b.current_route_id = $' + (params.length + 1);
      params.push(routeId);
    }

    let statusFilter = '';
    if (status === 'active') {
      statusFilter = 'AND b.last_gps_update > NOW() - INTERVAL \'5 minutes\' AND b.current_latitude IS NOT NULL';
    } else if (status === 'offline') {
      statusFilter = 'AND (b.last_gps_update <= NOW() - INTERVAL \'5 minutes\' OR b.current_latitude IS NULL)';
    }

    const buses = await query(
      `SELECT b.id, b.bus_number, b.registration_number,
              b.current_latitude, b.current_longitude, b.current_speed_kmh,
              b.current_heading, b.last_gps_update, b.capacity,
              d.full_name as driver_name,
              r.route_number, r.route_name,
              CASE
                WHEN b.last_gps_update > NOW() - INTERVAL '5 minutes' THEN 'active'
                WHEN b.last_gps_update > NOW() - INTERVAL '30 minutes' THEN 'stale'
                ELSE 'offline'
              END as tracking_status
       FROM buses b
       LEFT JOIN drivers d ON b.current_driver_id = d.id
       LEFT JOIN routes r ON b.current_route_id = r.id
       ${whereClause} ${statusFilter}
       ORDER BY b.bus_number`,
      params
    );

    return buses.rows.map(bus => ({
      busId: bus.id,
      busNumber: bus.bus_number,
      registrationNumber: bus.registration_number,
      status: bus.tracking_status,
      latitude: bus.current_latitude ? parseFloat(bus.current_latitude) : null,
      longitude: bus.current_longitude ? parseFloat(bus.current_longitude) : null,
      speed: bus.current_speed_kmh ? parseFloat(bus.current_speed_kmh) : null,
      heading: bus.current_heading ? parseFloat(bus.current_heading) : null,
      lastUpdate: bus.last_gps_update,
      driver: bus.driver_name ? {
        name: bus.driver_name
      } : null,
      route: bus.route_number ? {
        number: bus.route_number,
        name: bus.route_name
      } : null,
      capacity: bus.capacity
    }));
  }

  // Get buses on a specific route
  async getBusesOnRoute(routeId, activeOnly = true) {
    const route = await getRow(
      'SELECT id, route_number, route_name, is_active FROM routes WHERE id = $1',
      [routeId]
    );

    if (!route || !route.is_active) {
      throw new NotFoundError('Route not found or inactive');
    }

    let activeFilter = '';
    if (activeOnly) {
      activeFilter = 'AND b.last_gps_update > NOW() - INTERVAL \'5 minutes\' AND b.current_latitude IS NOT NULL';
    }

    const buses = await query(
      `SELECT b.id, b.bus_number, b.current_latitude, b.current_longitude,
              b.current_speed_kmh, b.current_heading, b.last_gps_update,
              d.full_name as driver_name,
              ROUND(ST_Distance(
                ll_to_earth(b.current_latitude, b.current_longitude),
                (SELECT ll_to_earth(bs.latitude, bs.longitude)
                 FROM route_stops rs
                 JOIN bus_stops bs ON rs.stop_id = bs.id
                 WHERE rs.route_id = $1 AND rs.stop_order = 1)
              ) / 1000) as distance_from_start_km
       FROM buses b
       LEFT JOIN drivers d ON b.current_driver_id = d.id
       WHERE b.current_route_id = $1 AND b.is_active = true ${activeFilter}
       ORDER BY distance_from_start_km`,
      [routeId]
    );

    return {
      route: {
        id: route.id,
        number: route.route_number,
        name: route.route_name
      },
      buses: buses.rows.map(bus => ({
        busId: bus.id,
        busNumber: bus.bus_number,
        latitude: parseFloat(bus.current_latitude),
        longitude: parseFloat(bus.current_longitude),
        speed: bus.current_speed_kmh ? parseFloat(bus.current_speed_kmh) : null,
        heading: bus.current_heading ? parseFloat(bus.current_heading) : null,
        lastUpdate: bus.last_gps_update,
        driver: bus.driver_name ? {
          name: bus.driver_name
        } : null,
        distanceFromStartKm: parseFloat(bus.distance_from_start_km)
      }))
    };
  }

  // Get nearby buses to a specific location
  async getNearbyBuses(latitude, longitude, radiusKm = 2) {
    if (!latitude || !longitude) {
      throw new ValidationError('Latitude and longitude are required');
    }

    const buses = await query(
      `SELECT b.id, b.bus_number, b.current_latitude, b.current_longitude,
              b.current_speed_kmh, b.current_heading, b.last_gps_update,
              r.route_number, r.route_name,
              ROUND(ST_Distance(
                ll_to_earth(b.current_latitude, b.current_longitude),
                ll_to_earth($1, $2)
              ) / 1000) as distance_km,
              ROUND(ST_Distance(
                ll_to_earth(b.current_latitude, b.current_longitude),
                ll_to_earth($1, $2)
              ) / GREATEST(b.current_speed_kmh / 60, 0.5)) as eta_minutes
       FROM buses b
       LEFT JOIN routes r ON b.current_route_id = r.id
       WHERE b.is_active = true AND b.last_gps_update > NOW() - INTERVAL '5 minutes'
             AND b.current_latitude IS NOT NULL AND b.current_longitude IS NOT NULL
             AND ST_DWithin(
               ll_to_earth(b.current_latitude, b.current_longitude),
               ll_to_earth($1, $2),
               $3 * 1000
             )
       ORDER BY distance_km`,
      [latitude, longitude, radiusKm]
    );

    return buses.rows.map(bus => ({
      busId: bus.id,
      busNumber: bus.bus_number,
      latitude: parseFloat(bus.current_latitude),
      longitude: parseFloat(bus.current_longitude),
      distanceKm: parseFloat(bus.distance_km),
      etaMinutes: parseInt(bus.eta_minutes),
      speed: bus.current_speed_kmh ? parseFloat(bus.current_speed_kmh) : null,
      heading: bus.current_heading ? parseFloat(bus.current_heading) : null,
      lastUpdate: bus.last_gps_update,
      route: bus.route_number ? {
        number: bus.route_number,
        name: bus.route_name
      } : null
    }));
  }

  // Get bus capacity information
  async getBusCapacity(busId) {
    const bus = await getRow(
      'SELECT id, bus_number, capacity FROM buses WHERE id = $1 AND is_active = true',
      [busId]
    );

    if (!bus) {
      throw new NotFoundError('Bus not found');
    }

    // Get latest capacity reading
    const capacity = await getRow(
      `SELECT passenger_count, capacity_percentage, timestamp, estimated_by
       FROM bus_capacity
       WHERE bus_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [busId]
    );

    if (!capacity) {
      return {
        busId: bus.id,
        busNumber: bus.bus_number,
        totalCapacity: bus.capacity,
        currentPassengers: 0,
        capacityPercentage: 0,
        crowdLevel: 'unknown',
        lastUpdate: null
      };
    }

    const now = new Date();
    const lastUpdate = new Date(capacity.timestamp);
    const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);

    let crowdLevel = 'unknown';
    if (capacity.capacity_percentage < 30) {
      crowdLevel = 'empty';
    } else if (capacity.capacity_percentage < 60) {
      crowdLevel = 'normal';
    } else if (capacity.capacityPercentage < 80) {
      crowdLevel = 'moderate';
    } else {
      crowdLevel = 'full';
    }

    // Mark data as stale if older than 15 minutes
    if (minutesSinceUpdate > 15) {
      crowdLevel = 'unknown';
    }

    return {
      busId: bus.id,
      busNumber: bus.bus_number,
      totalCapacity: bus.capacity,
      currentPassengers: capacity.passenger_count,
      capacityPercentage: parseFloat(capacity.capacity_percentage),
      crowdLevel,
      estimatedBy: capacity.estimated_by,
      lastUpdate: capacity.timestamp,
      isDataFresh: minutesSinceUpdate <= 15
    };
  }

  // Get ETA for buses arriving at a specific stop
  async getStopETA(stopId, maxBuses = 5) {
    const stop = await getRow(
      'SELECT id, name, latitude, longitude FROM bus_stops WHERE id = $1',
      [stopId]
    );

    if (!stop) {
      throw new NotFoundError('Stop not found');
    }

    const buses = await query(
      `SELECT DISTINCT b.id, b.bus_number, b.current_speed_kmh,
              r.route_number, r.route_name,
              rs.stop_order as stop_order,
              ROUND(ST_Distance(
                ll_to_earth(b.current_latitude, b.current_longitude),
                ll_to_earth($1, $2)
              ) / 1000) as distance_km,
              ROUND(
                ST_Distance(ll_to_earth(b.current_latitude, b.current_longitude), ll_to_earth($1, $2)) / 1000 /
                GREATEST(b.current_speed_kmh / 60, 0.5)
              ) as eta_minutes,
              rsrs.route_stops_remaining
       FROM buses b
       JOIN routes r ON b.current_route_id = r.id
       JOIN route_stops rs ON rs.route_id = r.id AND rs.stop_id = $3
       LEFT JOIN (
         SELECT rs.route_id, COUNT(*) - rs.stop_order + 1 as route_stops_remaining
         FROM route_stops rs
         WHERE rs.stop_id = $3
       ) rsrs ON rsrs.route_id = r.id
       WHERE b.is_active = true AND b.last_gps_update > NOW() - INTERVAL '5 minutes'
             AND b.current_latitude IS NOT NULL
             AND ST_DWithin(
               ll_to_earth(b.current_latitude, b.current_longitude),
               ll_to_earth($1, $2),
               5000
             )
       ORDER BY eta_minutes
       LIMIT $4`,
      [stop.latitude, stop.longitude, stopId, maxBuses]
    );

    return {
      stop: {
        id: stop.id,
        name: stop.name,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude)
      },
      approachingBuses: buses.rows.map(bus => ({
        busId: bus.id,
        busNumber: bus.bus_number,
        route: {
          number: bus.route_number,
          name: bus.route_name
        },
        distanceKm: parseFloat(bus.distance_km),
        etaMinutes: Math.max(1, Math.ceil(bus.eta_minutes)), // Minimum 1 minute
        currentSpeed: bus.current_speed_kmh ? parseFloat(bus.current_speed_kmh) : null,
        stopsRemaining: bus.route_stops_remaining || 1
      }))
    };
  }

  // Get bus route progress
  async getBusRouteProgress(busId) {
    const bus = await getRow(
      `SELECT b.id, b.bus_number, b.current_latitude, b.current_longitude,
              b.current_route_id, b.last_gps_update,
              r.route_number, r.route_name, r.start_point, r.end_point
       FROM buses b
       LEFT JOIN routes r ON b.current_route_id = r.id
       WHERE b.id = $1 AND b.is_active = true`,
      [busId]
    );

    if (!bus) {
      throw new NotFoundError('Bus not found');
    }

    if (!bus.current_route_id) {
      return {
        busId: bus.id,
        busNumber: bus.bus_number,
        onRoute: false,
        message: 'Bus is not currently on a route'
      };
    }

    // Get route stops with order
    const routeStops = await getRows(
      `SELECT rs.stop_order, bs.id, bs.name, bs.latitude, bs.longitude,
              ROUND(ST_Distance(
                ll_to_earth($1, $2),
                ll_to_earth(bs.latitude, bs.longitude)
              ) / 1000) as distance_from_stop_km
       FROM route_stops rs
       JOIN bus_stops bs ON rs.stop_id = bs.id
       WHERE rs.route_id = $3
       ORDER BY rs.stop_order`,
      [bus.current_latitude || 0, bus.current_longitude || 0, bus.current_route_id]
    );

    // Find nearest stop (current position)
    let nearestStop = null;
    let minDistance = Infinity;

    for (const stop of routeStops) {
      if (stop.distance_from_stop_km < minDistance) {
        minDistance = stop.distance_from_stop_km;
        nearestStop = stop;
      }
    }

    // Determine progress
    const totalStops = routeStops.length;
    const currentStopIndex = nearestStop ? nearestStop.stop_order - 1 : 0;
    const progressPercentage = totalStops > 0 ? (currentStopIndex / totalStops) * 100 : 0;

    // Get next few stops
    const upcomingStops = routeStops
      .filter(stop => stop.stop_order > (nearestStop?.stop_order || 0))
      .slice(0, 3)
      .map(stop => ({
        id: stop.id,
        name: stop.name,
        order: stop.stop_order,
        distanceKm: stop.distance_from_stop_km,
        estimatedMinutes: Math.ceil(stop.distance_from_stop_km / 0.5) // Assuming 30 km/h
      }));

    return {
      busId: bus.id,
      busNumber: bus.bus_number,
      onRoute: true,
      route: {
        number: bus.route_number,
        name: bus.route_name,
        startPoint: bus.start_point,
        endPoint: bus.end_point
      },
      progress: {
        percentage: Math.round(progressPercentage),
        currentStop: nearestStop ? {
          id: nearestStop.id,
          name: nearestStop.name,
          order: nearestStop.stop_order
        } : null,
        totalStops,
        completedStops: currentStopIndex
      },
      upcomingStops,
      lastUpdate: bus.last_gps_update
    };
  }

  // Get GPS tracking history for a bus
  async getBusTrackingHistory(busId, startTime, endTime, limit = 100) {
    const bus = await getRow(
      'SELECT id, bus_number FROM buses WHERE id = $1 AND is_active = true',
      [busId]
    );

    if (!bus) {
      throw new NotFoundError('Bus not found');
    }

    let whereClause = 'WHERE bus_id = $1';
    const params = [busId];

    if (startTime) {
      whereClause += ' AND timestamp >= $' + (params.length + 1);
      params.push(startTime);
    }

    if (endTime) {
      whereClause += ' AND timestamp <= $' + (params.length + 1);
      params.push(endTime);
    }

    whereClause += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const trackingData = await query(
      `SELECT latitude, longitude, speed_kmh, heading,
              accuracy_meters, timestamp, gps_quality
       FROM gps_tracking
       ${whereClause}`,
      params
    );

    return {
      busId: bus.id,
      busNumber: bus.bus_number,
      trackingData: trackingData.rows.map(point => ({
        latitude: parseFloat(point.latitude),
        longitude: parseFloat(point.longitude),
        speed: point.speed_kmh ? parseFloat(point.speed_kmh) : null,
        heading: point.heading ? parseFloat(point.heading) : null,
        accuracy: point.accuracy_meters ? parseFloat(point.accuracy_meters) : null,
        quality: point.gps_quality,
        timestamp: point.timestamp
      })),
      parameters: {
        startTime,
        endTime,
        limit
      }
    };
  }
}

module.exports = new TrackingService();