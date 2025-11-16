-- Bhutan Bus System Database Schema
-- Version 1.0.0
-- Compatible with PostgreSQL 13+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- Core Tables

-- Users Table (Bhutan-specific with CID integration)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cid_number VARCHAR(11) UNIQUE, -- Bhutan Citizen ID number
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  is_student BOOLEAN DEFAULT false,
  student_id_verified BOOLEAN DEFAULT false,
  is_senior_citizen BOOLEAN DEFAULT false,
  is_disabled BOOLEAN DEFAULT false,
  disability_verified BOOLEAN DEFAULT false,
  preferred_language VARCHAR(10) DEFAULT 'en', -- 'en' or 'dz'
  dzongkha_name VARCHAR(255),
  district VARCHAR(50), -- Thimphu, Paro, Punakha, etc.
  is_tourist BOOLEAN DEFAULT false,
  passport_number VARCHAR(50), -- for tourists
  accessibility_needs JSONB,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Digital Cards Table (Bhutan-specific with existing card types)
CREATE TABLE digital_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  physical_card_number VARCHAR(16) UNIQUE, -- links to existing physical cards
  digital_card_number VARCHAR(16) UNIQUE NOT NULL,
  cvv VARCHAR(4) NOT NULL,
  expiry_date DATE NOT NULL,
  balance DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('regular', 'student', 'disabled', 'senior')),
  discount_percentage INTEGER DEFAULT 0 CHECK (discount_percentage IN (0, 10, 20, 30)),
  physical_card_linked BOOLEAN DEFAULT false,
  is_tourist_card BOOLEAN DEFAULT false,
  daily_spending_limit DECIMAL(10,2),
  monthly_spending_limit DECIMAL(10,2),
  last_used TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Buses Table
CREATE TABLE buses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_number VARCHAR(20) UNIQUE NOT NULL,
  bus_number VARCHAR(10) NOT NULL,
  capacity INTEGER NOT NULL,
  bus_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'electric', 'accessible'
  make VARCHAR(100),
  model VARCHAR(100),
  year_manufactured INTEGER,
  current_driver_id UUID,
  current_route_id UUID,
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  current_speed_kmh DECIMAL(5,2),
  current_heading DECIMAL(5,2), -- degrees
  last_gps_update TIMESTAMP WITH TIME ZONE,
  fuel_level DECIMAL(5,2), -- percentage
  is_active BOOLEAN DEFAULT true,
  is_accessible BOOLEAN DEFAULT false,
  has_wifi BOOLEAN DEFAULT false,
  has_charging_ports BOOLEAN DEFAULT false,
  maintenance_due TIMESTAMP WITH TIME ZONE,
  insurance_expiry TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drivers Table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  license_number VARCHAR(50) NOT NULL,
  license_expiry DATE,
  photo_url VARCHAR(500),
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_trips INTEGER DEFAULT 0,
  years_of_service INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_certified BOOLEAN DEFAULT false,
  last_training_date DATE,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routes Table
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_number VARCHAR(10) UNIQUE NOT NULL,
  route_name VARCHAR(255) NOT NULL,
  route_name_dz VARCHAR(255), -- Dzongkha name
  start_point VARCHAR(255) NOT NULL,
  end_point VARCHAR(255) NOT NULL,
  total_distance_km DECIMAL(6,2) NOT NULL,
  estimated_duration_minutes INTEGER NOT NULL,
  base_fare DECIMAL(10,2) NOT NULL,
  per_km_fare DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_circular BOOLEAN DEFAULT false, -- for routes that return to start point
  service_type VARCHAR(20) DEFAULT 'regular', -- 'regular', 'express', 'night', 'festival'
  peak_hours_start TIME,
  peak_hours_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bus Stops Table
CREATE TABLE bus_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  name_dz VARCHAR(255), -- Dzongkha name
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  is_accessible BOOLEAN DEFAULT false,
  shelter BOOLEAN DEFAULT false,
  has_lighting BOOLEAN DEFAULT false,
  has_security_camera BOOLEAN DEFAULT false,
  stop_type VARCHAR(20) DEFAULT 'regular', -- 'regular', 'terminal', 'major', 'minor'
  landmark VARCHAR(255), -- nearby landmark for identification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Route Stops (Many-to-Many with ordering)
CREATE TABLE route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES bus_stops(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL,
  distance_from_start_km DECIMAL(6,2),
  estimated_time_from_start_minutes INTEGER,
  is_mandatory_stop BOOLEAN DEFAULT false, -- buses must stop here
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(route_id, stop_order)
);

-- Transactions Table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID REFERENCES digital_cards(id),
  type VARCHAR(20) CHECK (type IN ('recharge', 'fare', 'refund', 'penalty')),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50), -- 'mobile_wallet', 'bank_card', 'cash', 'qr_code', 'physical_card'
  payment_gateway_transaction_id VARCHAR(255),
  gateway_response JSONB, -- store gateway response for debugging
  ride_id UUID REFERENCES ride_history(id),
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ride History Table
CREATE TABLE ride_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  card_id UUID REFERENCES digital_cards(id),
  bus_id UUID REFERENCES buses(id),
  route_id UUID REFERENCES routes(id),
  driver_id UUID REFERENCES drivers(id),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  start_stop_id UUID REFERENCES bus_stops(id),
  end_stop_id UUID REFERENCES bus_stops(id),
  fare_ngultrum DECIMAL(10,2) NOT NULL,
  distance_km DECIMAL(6,2),
  payment_status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed'
  stops_count INTEGER DEFAULT 0,
  was_delayed BOOLEAN DEFAULT false,
  delay_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schedules Table
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
  departure_time TIME NOT NULL,
  arrival_time TIME,
  frequency_minutes INTEGER,
  is_peak_hour BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GPS Tracking Table (for historical data)
CREATE TABLE gps_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  speed_kmh DECIMAL(5,2),
  heading DECIMAL(5,2), -- degrees
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  accuracy_meters DECIMAL(5,2),
  altitude_meters DECIMAL(7,2),
  satellite_count INTEGER,
  gps_quality VARCHAR(20) -- 'excellent', 'good', 'fair', 'poor'
);

-- Bus Capacity Tracking
CREATE TABLE bus_capacity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
  passenger_count INTEGER NOT NULL,
  capacity_percentage DECIMAL(5,2) GENERATED ALWAYS AS ((passenger_count * 100.0) / (SELECT capacity FROM buses WHERE id = bus_id)) STORED,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  location_stop_id UUID REFERENCES bus_stops(id),
  estimated_by VARCHAR(20) DEFAULT 'driver', -- 'driver', 'sensor', 'ai'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'bus_arrival', 'low_balance', 'emergency', 'route_change', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_dz TEXT, -- Dzongkha message
  data JSONB, -- additional notification data
  is_read BOOLEAN DEFAULT false,
  sent_via VARCHAR(20), -- 'push', 'sms', 'email', 'whatsapp'
  sent_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  priority VARCHAR(10) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feedback Table
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  ride_id UUID REFERENCES ride_history(id),
  driver_id UUID REFERENCES drivers(id),
  type VARCHAR(50) NOT NULL, -- 'complaint', 'suggestion', 'rating', 'lost_found'
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  subject VARCHAR(255),
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'resolved', 'closed'
  admin_response TEXT,
  responded_by UUID REFERENCES admin_users(id),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lost & Found Items Table
CREATE TABLE lost_found_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reported_by_user_id UUID REFERENCES users(id),
  found_by_user_id UUID REFERENCES users(id),
  item_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  color VARCHAR(50),
  bus_id UUID REFERENCES buses(id),
  route_id UUID REFERENCES routes(id),
  found_date TIMESTAMP WITH TIME ZONE,
  reported_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'lost', -- 'lost', 'found', 'claimed', 'disposed'
  photo_urls JSONB,
  claimed_by_user_id UUID REFERENCES users(id),
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin Users Table
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'super_admin', 'fleet_manager', 'customer_service', 'analyst'
  permissions JSONB,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revenue Analytics Table
CREATE TABLE revenue_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  route_id UUID REFERENCES routes(id),
  total_rides INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_passengers INTEGER DEFAULT 0,
  average_fare DECIMAL(10,2),
  peak_hour_rides INTEGER DEFAULT 0,
  off_peak_hour_rides INTEGER DEFAULT 0,
  payment_method_breakdown JSONB, -- breakdown by payment method
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, route_id)
);

-- Emergency Events Table
CREATE TABLE emergency_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  bus_id UUID REFERENCES buses(id),
  driver_id UUID REFERENCES drivers(id),
  event_type VARCHAR(50) NOT NULL, -- 'sos', 'accident', 'medical', 'security'
  description TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'resolved', 'false_alarm'
  response_team_notified BOOLEAN DEFAULT false,
  response_time_minutes INTEGER,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes for Better Query Performance
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cid ON users(cid_number);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_digital_cards_user_id ON digital_cards(user_id);
CREATE INDEX idx_digital_cards_card_number ON digital_cards(digital_card_number);
CREATE INDEX idx_digital_cards_physical_number ON digital_cards(physical_card_number);
CREATE INDEX idx_digital_cards_type ON digital_cards(card_type);
CREATE INDEX idx_digital_cards_active ON digital_cards(is_active);

CREATE INDEX idx_buses_registration ON buses(registration_number);
CREATE INDEX idx_buses_number ON buses(bus_number);
CREATE INDEX idx_buses_active ON buses(is_active);
CREATE INDEX idx_buses_driver ON buses(current_driver_id);
CREATE INDEX idx_buses_route ON buses(current_route_id);

CREATE INDEX idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX idx_drivers_active ON drivers(is_active);
CREATE INDEX idx_drivers_rating ON drivers(average_rating);

CREATE INDEX idx_routes_number ON routes(route_number);
CREATE INDEX idx_routes_active ON routes(is_active);
CREATE INDEX idx_routes_type ON routes(service_type);

CREATE INDEX idx_bus_stops_location ON bus_stops USING GIST (
  ll_to_earth(latitude, longitude)
);
CREATE INDEX idx_bus_stops_name ON bus_stops(name);
CREATE INDEX idx_bus_stops_accessible ON bus_stops(is_accessible);

CREATE INDEX idx_route_stops_route_order ON route_stops(route_id, stop_order);
CREATE INDEX idx_route_stops_stop ON route_stops(stop_id);

CREATE INDEX idx_transactions_card_id ON transactions(card_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);

CREATE INDEX idx_ride_history_user_id ON ride_history(user_id);
CREATE INDEX idx_ride_history_card_id ON ride_history(card_id);
CREATE INDEX idx_ride_history_bus_id ON ride_history(bus_id);
CREATE INDEX idx_ride_history_created_at ON ride_history(created_at);
CREATE INDEX idx_ride_history_start_time ON ride_history(start_time);

CREATE INDEX idx_schedules_route_day ON schedules(route_id, day_of_week);
CREATE INDEX idx_schedules_bus ON schedules(bus_id);
CREATE INDEX idx_schedules_driver ON schedules(driver_id);
CREATE INDEX idx_schedules_active ON schedules(is_active);

CREATE INDEX idx_gps_tracking_bus_timestamp ON gps_tracking(bus_id, timestamp);
CREATE INDEX idx_gps_tracking_location ON gps_tracking USING GIST (
  ll_to_earth(latitude, longitude)
);
CREATE INDEX idx_gps_tracking_timestamp ON gps_tracking(timestamp);

CREATE INDEX idx_bus_capacity_bus_timestamp ON bus_capacity(bus_id, timestamp);
CREATE INDEX idx_bus_capacity_percentage ON bus_capacity(capacity_percentage);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_ride_id ON feedback(ride_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_type ON feedback(type);

CREATE INDEX idx_lost_found_status ON lost_found_items(status);
CREATE INDEX idx_lost_found_bus ON lost_found_items(bus_id);
CREATE INDEX idx_lost_found_date ON lost_found_items(found_date);

CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_active ON admin_users(is_active);

CREATE INDEX idx_revenue_analytics_date ON revenue_analytics(date);
CREATE INDEX idx_revenue_analytics_route ON revenue_analytics(route_id);

CREATE INDEX idx_emergency_events_status ON emergency_events(status);
CREATE INDEX idx_emergency_events_type ON emergency_events(event_type);
CREATE INDEX idx_emergency_events_timestamp ON emergency_events(timestamp);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_cards_updated_at BEFORE UPDATE ON digital_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buses_updated_at BEFORE UPDATE ON buses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Active buses with current location info
CREATE VIEW active_buses AS
SELECT
    b.id,
    b.bus_number,
    b.registration_number,
    b.capacity,
    b.current_latitude,
    b.current_longitude,
    b.current_speed_kmh,
    b.current_heading,
    b.last_gps_update,
    d.full_name as driver_name,
    d.phone_number as driver_phone,
    r.route_number,
    r.route_name,
    r.start_point,
    r.end_point
FROM buses b
LEFT JOIN drivers d ON b.current_driver_id = d.id
LEFT JOIN routes r ON b.current_route_id = r.id
WHERE b.is_active = true;

-- User cards with balances
CREATE VIEW user_cards AS
SELECT
    u.id as user_id,
    u.full_name,
    u.phone_number,
    dc.id as card_id,
    dc.digital_card_number,
    dc.balance,
    dc.card_type,
    dc.discount_percentage,
    dc.expiry_date,
    dc.is_active,
    CASE
        WHEN dc.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN dc.balance < 20 THEN 'low_balance'
        ELSE 'active'
    END as card_status
FROM users u
JOIN digital_cards dc ON u.id = dc.user_id
WHERE dc.is_active = true;

-- Today's rides summary
CREATE VIEW today_rides_summary AS
SELECT
    COUNT(*) as total_rides,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT bus_id) as active_buses,
    SUM(fare_ngultrum) as total_revenue,
    AVG(fare_ngultrum) as average_fare,
    AVG(distance_km) as average_distance
FROM ride_history
WHERE DATE(start_time) = CURRENT_DATE
AND payment_status = 'completed';

-- Route performance metrics
CREATE VIEW route_performance AS
SELECT
    r.id as route_id,
    r.route_number,
    r.route_name,
    COUNT(rh.id) as total_rides,
    COUNT(DISTINCT rh.user_id) as unique_passengers,
    SUM(rh.fare_ngultrum) as total_revenue,
    AVG(rh.fare_ngultrum) as average_fare,
    AVG(rh.distance_km) as average_distance,
    COUNT(DISTINCT rh.bus_id) as buses_serving
FROM routes r
LEFT JOIN ride_history rh ON r.id = rh.route_id
WHERE DATE(rh.start_time) >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY r.id, r.route_number, r.route_name
ORDER BY total_revenue DESC;

-- Add comments for documentation
COMMENT ON TABLE users IS 'Users of the Bhutan Bus System including locals and tourists';
COMMENT ON TABLE digital_cards IS 'Digital bus cards linked to users with payment functionality';
COMMENT ON TABLE buses IS 'Bus fleet information with GPS tracking capabilities';
COMMENT ON TABLE drivers IS 'Driver information including ratings and certifications';
COMMENT ON TABLE routes IS 'Bus routes with fare information and schedules';
COMMENT ON TABLE bus_stops IS 'Bus stop locations with accessibility information';
COMMENT ON TABLE transactions IS 'All financial transactions including recharges and fares';
COMMENT ON TABLE ride_history IS 'Complete ride history with fare and route information';
COMMENT ON TABLE schedules IS 'Bus schedules with route and driver assignments';
COMMENT ON TABLE gps_tracking IS 'Historical GPS tracking data for buses';
COMMENT ON TABLE notifications IS 'Push notifications sent to users';
COMMENT ON TABLE feedback IS 'User feedback including complaints and ratings';
COMMENT ON TABLE lost_found_items IS 'Lost and found items tracking system';
COMMENT ON TABLE admin_users IS 'Administrative users with role-based access';
COMMENT ON TABLE emergency_events IS 'Emergency events and SOS alerts';