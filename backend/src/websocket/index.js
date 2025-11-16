const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { logUserAction, logBusTracking, logError } = require('../utils/logger');

// Store active connections
const activeConnections = new Map();
const busSubscriptions = new Map(); // busId -> Set of socketIds
const routeSubscriptions = new Map(); // routeId -> Set of socketIds
const stopSubscriptions = new Map(); // stopId -> Set of socketIds

// Initialize Socket.IO server
const initializeSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        // Allow anonymous connections for some features (like public bus tracking)
        socket.userId = null;
        socket.isAuthenticated = false;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Add user info to socket
      socket.userId = decoded.id;
      socket.isAuthenticated = true;

      logUserAction(decoded.id, 'websocket_connected', {
        socketId: socket.id,
        ip: socket.handshake.address
      });

      next();
    } catch (error) {
      // For public tracking endpoints, allow anonymous connections
      if (socket.handshake.query.type === 'public_tracking') {
        socket.userId = null;
        socket.isAuthenticated = false;
        return next();
      }

      logError(error, { context: 'socket_auth' });
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logUserAction(socket.userId || 'anonymous', 'socket_connected', {
      socketId: socket.id,
      ip: socket.handshake.address
    });

    // Store connection
    activeConnections.set(socket.id, {
      userId: socket.userId,
      isAuthenticated: socket.isAuthenticated,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    // Join personal room for authenticated users
    if (socket.isAuthenticated) {
      socket.join(`user_${socket.userId}`);
    }

    // Handle subscription to bus tracking
    socket.on('subscribe_to_bus', async (data) => {
      try {
        const { busId } = data;

        if (!busId) {
          socket.emit('error', { message: 'Bus ID is required' });
          return;
        }

        // Validate bus exists and is active
        const bus = await getRow(
          'SELECT id, bus_number, registration_number, is_active FROM buses WHERE id = $1',
          [busId]
        );

        if (!bus || !bus.is_active) {
          socket.emit('error', { message: 'Bus not found or inactive' });
          return;
        }

        // Add to bus subscription
        if (!busSubscriptions.has(busId)) {
          busSubscriptions.set(busId, new Set());
        }
        busSubscriptions.get(busId).add(socket.id);

        // Join bus room
        socket.join(`bus_${busId}`);

        // Send current bus location
        const currentLocation = await getCurrentBusLocation(busId);
        if (currentLocation) {
          socket.emit('bus_location_update', currentLocation);
        }

        // Send upcoming stops
        const upcomingStops = await getUpcomingStops(busId);
        socket.emit('upcoming_stops', upcomingStops);

        logUserAction(socket.userId, 'subscribed_to_bus', { busId });

      } catch (error) {
        logError(error, { context: 'subscribe_to_bus', socketId: socket.id });
        socket.emit('error', { message: 'Failed to subscribe to bus' });
      }
    });

    // Handle subscription to route tracking
    socket.on('subscribe_to_route', async (data) => {
      try {
        const { routeId } = data;

        if (!routeId) {
          socket.emit('error', { message: 'Route ID is required' });
          return;
        }

        // Validate route exists and is active
        const route = await getRow(
          'SELECT id, route_number, route_name, is_active FROM routes WHERE id = $1',
          [routeId]
        );

        if (!route || !route.is_active) {
          socket.emit('error', { message: 'Route not found or inactive' });
          return;
        }

        // Add to route subscription
        if (!routeSubscriptions.has(routeId)) {
          routeSubscriptions.set(routeId, new Set());
        }
        routeSubscriptions.get(routeId).add(socket.id);

        // Join route room
        socket.join(`route_${routeId}`);

        // Send all active buses on this route
        const activeBuses = await getActiveBusesOnRoute(routeId);
        socket.emit('route_buses_update', activeBuses);

        logUserAction(socket.userId, 'subscribed_to_route', { routeId });

      } catch (error) {
        logError(error, { context: 'subscribe_to_route', socketId: socket.id });
        socket.emit('error', { message: 'Failed to subscribe to route' });
      }
    });

    // Handle subscription to stop tracking
    socket.on('subscribe_to_stop', async (data) => {
      try {
        const { stopId } = data;

        if (!stopId) {
          socket.emit('error', { message: 'Stop ID is required' });
          return;
        }

        // Validate stop exists
        const stop = await getRow(
          'SELECT id, name, latitude, longitude FROM bus_stops WHERE id = $1',
          [stopId]
        );

        if (!stop) {
          socket.emit('error', { message: 'Stop not found' });
          return;
        }

        // Add to stop subscription
        if (!stopSubscriptions.has(stopId)) {
          stopSubscriptions.set(stopId, new Set());
        }
        stopSubscriptions.get(stopId).add(socket.id);

        // Join stop room
        socket.join(`stop_${stopId}`);

        // Send ETA for buses arriving at this stop
        const etaData = await getStopETA(stopId);
        socket.emit('stop_eta_update', etaData);

        logUserAction(socket.userId, 'subscribed_to_stop', { stopId });

      } catch (error) {
        logError(error, { context: 'subscribe_to_stop', socketId: socket.id });
        socket.emit('error', { message: 'Failed to subscribe to stop' });
      }
    });

    // Handle unsubscribe requests
    socket.on('unsubscribe_from_bus', (data) => {
      const { busId } = data;
      if (busId && busSubscriptions.has(busId)) {
        busSubscriptions.get(busId).delete(socket.id);
        if (busSubscriptions.get(busId).size === 0) {
          busSubscriptions.delete(busId);
        }
        socket.leave(`bus_${busId}`);
        logUserAction(socket.userId, 'unsubscribed_from_bus', { busId });
      }
    });

    socket.on('unsubscribe_from_route', (data) => {
      const { routeId } = data;
      if (routeId && routeSubscriptions.has(routeId)) {
        routeSubscriptions.get(routeId).delete(socket.id);
        if (routeSubscriptions.get(routeId).size === 0) {
          routeSubscriptions.delete(routeId);
        }
        socket.leave(`route_${routeId}`);
        logUserAction(socket.userId, 'unsubscribed_from_route', { routeId });
      }
    });

    socket.on('unsubscribe_from_stop', (data) => {
      const { stopId } = data;
      if (stopId && stopSubscriptions.has(stopId)) {
        stopSubscriptions.get(stopId).delete(socket.id);
        if (stopSubscriptions.get(stopId).size === 0) {
          stopSubscriptions.delete(stopId);
        }
        socket.leave(`stop_${stopId}`);
        logUserAction(socket.userId, 'unsubscribed_from_stop', { stopId });
      }
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong');
      // Update last activity
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.lastActivity = new Date();
      }
    });

    // Handle location updates (from bus driver app)
    socket.on('update_bus_location', async (data) => {
      try {
        // Only authenticated users can update bus locations
        if (!socket.isAuthenticated) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        const { busId, latitude, longitude, speed, heading, accuracy } = data;

        // Validate required fields
        if (!busId || !latitude || !longitude) {
          socket.emit('error', { message: 'Bus ID, latitude, and longitude are required' });
          return;
        }

        // Validate user is authorized to update this bus (driver assignment)
        const bus = await getRow(
          `SELECT b.*, d.id as driver_id
           FROM buses b
           LEFT JOIN drivers d ON b.current_driver_id = d.id
           WHERE b.id = $1`,
          [busId]
        );

        if (!bus) {
          socket.emit('error', { message: 'Bus not found' });
          return;
        }

        // For now, allow any authenticated user to update location
        // In production, check if user is the assigned driver

        // Update bus location in database
        await updateBusLocation(busId, {
          latitude,
          longitude,
          speed: speed || null,
          heading: heading || null,
          accuracy: accuracy || null,
          timestamp: new Date()
        });

        // Store in GPS tracking history
        await storeGPSHistory(busId, {
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          timestamp: new Date()
        });

        // Broadcast to subscribed clients
        const locationUpdate = {
          busId,
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          timestamp: new Date().toISOString()
        };

        io.to(`bus_${busId}`).emit('bus_location_update', locationUpdate);

        // Update route subscribers if bus is on a route
        if (bus.current_route_id) {
          const routeUpdate = {
            busId,
            routeId: bus.current_route_id,
            latitude,
            longitude,
            speed,
            heading,
            timestamp: new Date().toISOString()
          };
          io.to(`route_${bus.current_route_id}`).emit('route_buses_update', [routeUpdate]);
        }

        // Check for stops nearby and update ETA
        await updateNearbyStopsETA(busId, latitude, longitude);

        logBusTracking(busId, latitude, longitude, speed, new Date());

      } catch (error) {
        logError(error, { context: 'update_bus_location', socketId: socket.id });
        socket.emit('error', { message: 'Failed to update bus location' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logUserAction(socket.userId || 'anonymous', 'socket_disconnected', {
        socketId: socket.id,
        reason,
        connectedDuration: activeConnections.get(socket.id)?.connectedAt
          ? Date.now() - activeConnections.get(socket.id).connectedAt.getTime()
          : null
      });

      // Clean up subscriptions
      for (const [busId, subscribers] of busSubscriptions.entries()) {
        if (subscribers.has(socket.id)) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            busSubscriptions.delete(busId);
          }
        }
      }

      for (const [routeId, subscribers] of routeSubscriptions.entries()) {
        if (subscribers.has(socket.id)) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            routeSubscriptions.delete(routeId);
          }
        }
      }

      for (const [stopId, subscribers] of stopSubscriptions.entries()) {
        if (subscribers.has(socket.id)) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            stopSubscriptions.delete(stopId);
          }
        }
      }

      // Remove from active connections
      activeConnections.delete(socket.id);
    });

    // Error handling
    socket.on('error', (error) => {
      logError(error, { context: 'socket_error', socketId: socket.id });
    });
  });

  // Periodic cleanup of inactive connections
  setInterval(() => {
    cleanupInactiveConnections(io);
  }, 30000); // Every 30 seconds

  // Periodic broadcast of bus positions for subscribed clients
  setInterval(() => {
    broadcastBusPositions(io);
  }, 10000); // Every 10 seconds

  return io;
};

// Helper functions for database operations
const { getRow, update, insert, query } = require('../config/database');

// Get current bus location
const getCurrentBusLocation = async (busId) => {
  const result = await getRow(
    `SELECT id, bus_number, current_latitude, current_longitude,
            current_speed_kmh, current_heading, last_gps_update
     FROM buses
     WHERE id = $1 AND is_active = true`,
    [busId]
  );

  if (!result || !result.current_latitude || !result.current_longitude) {
    return null;
  }

  return {
    busId: result.id,
    busNumber: result.bus_number,
    latitude: result.current_latitude,
    longitude: result.current_longitude,
    speed: result.current_speed_kmh,
    heading: result.current_heading,
    lastUpdate: result.last_gps_update
  };
};

// Get upcoming stops for a bus
const getUpcomingStops = async (busId) => {
  // This would require complex logic based on route, current position, and direction
  // For now, return a basic implementation
  const result = await query(
    `SELECT rs.stop_order, bs.name, bs.latitude, bs.longitude,
            ROUND(ST_Distance(
              ll_to_earth(b.current_latitude, b.current_longitude),
              ll_to_earth(bs.latitude, bs.longitude)
            ) / 1000) as distance_km
     FROM buses b
     JOIN route_stops rs ON b.current_route_id = rs.route_id
     JOIN bus_stops bs ON rs.stop_id = bs.id
     WHERE b.id = $1
     ORDER BY rs.stop_order
     LIMIT 5`,
    [busId]
  );

  return result.rows.map(stop => ({
    name: stop.name,
    latitude: stop.latitude,
    longitude: stop.longitude,
    distanceKm: stop.distance_km,
    estimatedArrivalMinutes: Math.ceil(stop.distance_km / 0.5) // Assuming 30 km/h average speed
  }));
};

// Get active buses on a route
const getActiveBusesOnRoute = async (routeId) => {
  const result = await query(
    `SELECT id, bus_number, current_latitude, current_longitude,
            current_speed_kmh, current_heading, last_gps_update
     FROM buses
     WHERE current_route_id = $1 AND is_active = true
            AND current_latitude IS NOT NULL AND current_longitude IS NOT NULL
            AND last_gps_update > NOW() - INTERVAL '5 minutes'`,
    [routeId]
  );

  return result.rows.map(bus => ({
    busId: bus.id,
    busNumber: bus.bus_number,
    latitude: bus.current_latitude,
    longitude: bus.current_longitude,
    speed: bus.current_speed_kmh,
    heading: bus.current_heading,
    lastUpdate: bus.last_gps_update
  }));
};

// Get ETA for buses arriving at a stop
const getStopETA = async (stopId) => {
  // Complex ETA calculation based on current bus positions
  // For now, return a basic implementation
  const result = await query(
    `SELECT DISTINCT b.id, b.bus_number, r.route_number,
            ROUND(ST_Distance(
              ll_to_earth(b.current_latitude, b.current_longitude),
              ll_to_earth(bs.latitude, bs.longitude)
            ) / 1000) as distance_km,
            b.current_speed_kmh
     FROM buses b
     JOIN routes r ON b.current_route_id = r.id
     JOIN route_stops rs ON r.id = rs.route_id
     JOIN bus_stops bs ON rs.stop_id = bs.id
     WHERE bs.id = $1 AND b.is_active = true
            AND b.current_latitude IS NOT NULL
            AND b.current_longitude IS NOT NULL
            AND b.last_gps_update > NOW() - INTERVAL '5 minutes'
     ORDER BY distance_km`,
    [stopId]
  );

  return result.rows.map(bus => ({
    busId: bus.id,
    busNumber: bus.bus_number,
    routeNumber: bus.route_number,
    distanceKm: bus.distance_km,
    estimatedArrivalMinutes: bus.current_speed_kmh && bus.current_speed_kmh > 0
      ? Math.ceil(bus.distance_km / (bus.current_speed_kmh / 60)) // Convert km/h to km/min
      : Math.ceil(bus.distance_km / 0.5) // Default 30 km/h
  }));
};

// Update bus location in database
const updateBusLocation = async (busId, locationData) => {
  await query(
    `UPDATE buses
     SET current_latitude = $1, current_longitude = $2,
         current_speed_kmh = $3, current_heading = $4,
         last_gps_update = $5
     WHERE id = $6`,
    [
      locationData.latitude,
      locationData.longitude,
      locationData.speed,
      locationData.heading,
      locationData.timestamp,
      busId
    ]
  );
};

// Store GPS history
const storeGPSHistory = async (busId, locationData) => {
  await insert('gps_tracking', {
    bus_id: busId,
    latitude: locationData.latitude,
    longitude: locationData.longitude,
    speed_kmh: locationData.speed,
    heading: locationData.heading,
    accuracy_meters: locationData.accuracy,
    timestamp: locationData.timestamp
  });
};

// Update nearby stops ETA when bus moves
const updateNearbyStopsETA = async (busId, latitude, longitude) => {
  // Find stops within 2km of current bus position
  const nearbyStops = await query(
    `SELECT bs.id, bs.name, bs.latitude, bs.longitude,
            ROUND(ST_Distance(
              ll_to_earth($1, $2),
              ll_to_earth(bs.latitude, bs.longitude)
            ) / 1000) as distance_km
     FROM bus_stops bs
     WHERE ST_DWithin(
       ll_to_earth(bs.latitude, bs.longitude),
       ll_to_earth($1, $2),
       2000
     )
     ORDER BY distance_km`,
    [latitude, longitude]
  );

  // Broadcast ETA updates for nearby stops
  for (const stop of nearbyStops.rows) {
    if (stop.distance_km <= 2) { // Within 2km
      const etaData = await getStopETA(stop.id);

      // Only broadcast if there are actual buses approaching
      if (etaData.length > 0) {
        // This would be handled by the main io instance
        // For now, we'll log it
        logUserAction(null, 'stop_eta_broadcast', {
          stopId: stop.id,
          stopName: stop.name,
          approachingBuses: etaData.length
        });
      }
    }
  }
};

// Cleanup inactive connections
const cleanupInactiveConnections = (io) => {
  const now = Date.now();
  const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [socketId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity.getTime() > inactiveThreshold) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
      activeConnections.delete(socketId);
    }
  }
};

// Broadcast current positions for all subscribed buses
const broadcastBusPositions = async (io) => {
  for (const [busId, subscribers] of busSubscriptions.entries()) {
    if (subscribers.size > 0) {
      const location = await getCurrentBusLocation(busId);
      if (location) {
        io.to(`bus_${busId}`).emit('bus_location_update', location);
      }
    }
  }
};

// Get connection statistics
const getConnectionStats = () => {
  return {
    totalConnections: activeConnections.size,
    authenticatedConnections: Array.from(activeConnections.values()).filter(c => c.isAuthenticated).length,
    busSubscriptions: Object.fromEntries(
      Array.from(busSubscriptions.entries()).map(([busId, subscribers]) => [busId, subscribers.size])
    ),
    routeSubscriptions: Object.fromEntries(
      Array.from(routeSubscriptions.entries()).map(([routeId, subscribers]) => [routeId, subscribers.size])
    ),
    stopSubscriptions: Object.fromEntries(
      Array.from(stopSubscriptions.entries()).map(([stopId, subscribers]) => [stopId, subscribers.size])
    )
  };
};

module.exports = {
  initializeSocket,
  getConnectionStats,
  busSubscriptions,
  routeSubscriptions,
  stopSubscriptions
};