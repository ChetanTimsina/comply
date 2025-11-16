-- Sample data for testing the bus system
-- Run this after migration to populate with test data

-- Insert sample routes
INSERT INTO routes (route_number, route_name, route_name_dz, start_point, end_point, total_distance_km, estimated_duration_minutes, base_fare, per_km_fare) VALUES
('1', 'Memorial Chorten - Clock Tower', 'རྒྱལ་བསྟན་མཆོད་རྟེན། - ཆུ་ཚོད།', 'Memorial Chorten', 'Clock Tower', 2.5, 15, 5, 1),
('2', 'Thimphu Town - Motithang', 'འཕྲུལ་སྐྱིད་གྲོང་ཁྲོང་། - མོ་ཏི་ཐང་།', 'Thimphu Town', 'Motithang', 3.2, 20, 5, 1),
('3', 'Changlimithang - Babesa', 'ལྕང་གླིང་མཐང་། - བ་བས་ས།', 'Changlimithang', 'Babesa', 4.8, 30, 5, 1),
('8', 'Dechencholing - Sangaygang', 'བདེ་ཆེན་ལྕང་མཐང་། - སངས་རྒྱལ་སྒང་།', 'Dechencholing', 'Sangaygang', 5.5, 35, 5, 1),
('12', 'Kuenselphodrang - Yangchenphug', 'ཀུན་སལུང་ཕོ་བྲང་། - དབང་ཆེན་ཕུག།', 'Kuenselphodrang', 'Yangchenphug', 6.2, 40, 5, 1);

-- Insert sample bus stops
INSERT INTO bus_stops (name, name_dz, latitude, longitude, is_accessible, shelter, landmark) VALUES
('Memorial Chorten', 'རྒྱལ་བསྟན་མཆོད་རྟེན།', 27.4759, 89.6421, true, true, 'National Memorial'),
('Clock Tower', 'ཆུ་ཚོད།', 27.4728, 89.6403, true, true, 'Main Market'),
('Thimphu Town', 'འཕྲུལ་སྐྱིད་གྲོང་ཁྲོང་།', 27.4714, 89.6391, false, true, 'City Center'),
('Motithang', 'མོ་ཏི་ཐང་།', 27.4770, 89.6358, true, true, 'Motithang School'),
('Changlimithang', 'ལྕང་གླིང་མཐང་།', 27.4761, 89.6434, true, true, 'Sports Ground'),
('Babesa', 'བ་བས་ས།', 27.4625, 89.6342, false, true, 'South Area'),
('Dechencholing', 'བདེ་ཆེན་ལྕང་མཐང་།', 27.4892, 89.6417, true, true, 'North Area'),
('Sangaygang', 'སངས་རྒྱལ་སྒང་།', 27.4931, 89.6365, false, true, 'Hill Area'),
('Kuenselphodrang', 'ཀུན་སལུང་ཕོ་བྲང་།', 27.4803, 89.6328, true, true, 'Media Area'),
('Yangchenphug', 'དབང་ཆེན་ཕུག།', 27.4678, 89.6456, true, true, 'School Area');

-- Insert sample buses
INSERT INTO buses (registration_number, bus_number, capacity, bus_type, make, model, year_manufactured, is_active, is_accessible) VALUES
('BT-001-01', '1', 45, 'standard', 'Tata', 'Ultra', 2020, true, false),
('BT-002-01', '2', 45, 'standard', 'Tata', 'Ultra', 2020, true, false),
('BT-003-01', '3', 45, 'standard', 'Tata', 'Ultra', 2021, true, false),
('BT-008-01', '8', 45, 'standard', 'Tata', 'Ultra', 2019, true, false),
('BT-012-01', '12', 45, 'standard', 'Tata', 'Ultra', 2021, true, true);

-- Insert sample drivers
INSERT INTO drivers (employee_id, full_name, phone_number, license_number, photo_url, average_rating, total_trips, years_of_service, is_active) VALUES
('DRV001', 'Tashi Dorji', '+975171234567', 'BT-DL-2023-0001', 'https://example.com/driver1.jpg', 4.5, 1520, 5, true),
('DRV002', 'Sonam Wangchuk', '+975177654321', 'BT-DL-2022-0002', 'https://example.com/driver2.jpg', 4.7, 1890, 7, true),
('DRV003', 'Karma Tshering', '+975172345678', 'BT-DL-2021-0003', 'https://example.com/driver3.jpg', 4.3, 980, 3, true),
('DRV004', 'Dema Yangzom', '+975178765432', 'BT-DL-2023-0004', 'https://example.com/driver4.jpg', 4.8, 2100, 8, true),
('DRV005', 'Lhakpa Dhendup', '+975173456789', 'BT-DL-2020-0005', 'https://example.com/driver5.jpg', 4.4, 1230, 6, true);

-- Assign buses to routes
UPDATE buses SET current_route_id = (SELECT id FROM routes WHERE route_number = '1'), current_driver_id = (SELECT id FROM drivers WHERE employee_id = 'DRV001') WHERE bus_number = '1';
UPDATE buses SET current_route_id = (SELECT id FROM routes WHERE route_number = '2'), current_driver_id = (SELECT id FROM drivers WHERE employee_id = 'DRV002') WHERE bus_number = '2';
UPDATE buses SET current_route_id = (SELECT id FROM routes WHERE route_number = '3'), current_driver_id = (SELECT id FROM drivers WHERE employee_id = 'DRV003') WHERE bus_number = '3';
UPDATE buses SET current_route_id = (SELECT id FROM routes WHERE route_number = '8'), current_driver_id = (SELECT id FROM drivers WHERE employee_id = 'DRV004') WHERE bus_number = '8';
UPDATE buses SET current_route_id = (SELECT id FROM routes WHERE route_number = '12'), current_driver_id = (SELECT id FROM drivers WHERE employee_id = 'DRV005') WHERE bus_number = '12';

-- Set initial GPS locations for buses (sample coordinates around Thimphu)
UPDATE buses SET current_latitude = 27.4759, current_longitude = 89.6421, current_speed_kmh = 25, last_gps_update = NOW() WHERE bus_number = '1';
UPDATE buses SET current_latitude = 27.4714, current_longitude = 89.6391, current_speed_kmh = 30, last_gps_update = NOW() WHERE bus_number = '2';
UPDATE buses SET current_latitude = 27.4761, current_longitude = 89.6434, current_speed_kmh = 20, last_gps_update = NOW() WHERE bus_number = '3';
UPDATE buses SET current_latitude = 27.4892, current_longitude = 89.6417, current_speed_kmh = 35, last_gps_update = NOW() WHERE bus_number = '8';
UPDATE buses SET current_latitude = 27.4803, current_longitude = 89.6328, current_speed_kmh = 15, last_gps_update = NOW() WHERE bus_number = '12';

-- Create route stops relationships for Route 1 (Memorial Chorten - Clock Tower)
INSERT INTO route_stops (route_id, stop_id, stop_order, distance_from_start_km, estimated_time_from_start_minutes) VALUES
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM bus_stops WHERE name = 'Memorial Chorten'), 1, 0, 0),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM bus_stops WHERE name = 'Kuenselphodrang'), 2, 1.2, 7),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM bus_stops WHERE name = 'Thimphu Town'), 3, 2.0, 10),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM bus_stops WHERE name = 'Yangchenphug'), 4, 2.8, 12),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM bus_stops WHERE name = 'Clock Tower'), 5, 3.5, 15);

-- Create route stops relationships for Route 2 (Thimphu Town - Motithang)
INSERT INTO route_stops (route_id, stop_id, stop_order, distance_from_start_km, estimated_time_from_start_minutes) VALUES
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM bus_stops WHERE name = 'Thimphu Town'), 1, 0, 0),
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM bus_stops WHERE name = 'Memorial Chorten'), 2, 1.5, 8),
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM bus_stops WHERE name = 'Changlimithang'), 3, 2.8, 15),
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM bus_stops WHERE name = 'Motithang'), 4, 3.8, 20);

-- Create sample schedules
INSERT INTO schedules (route_id, bus_id, driver_id, day_of_week, departure_time, arrival_time, frequency_minutes, is_peak_hour) VALUES
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM buses WHERE bus_number = '1'), (SELECT id FROM drivers WHERE employee_id = 'DRV001'), 1, '06:30:00', '06:45:00', 15, true),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM buses WHERE bus_number = '1'), (SELECT id FROM drivers WHERE employee_id = 'DRV001'), 1, '07:00:00', '07:15:00', 15, true),
((SELECT id FROM routes WHERE route_number = '1'), (SELECT id FROM buses WHERE bus_number = '1'), (SELECT id FROM drivers WHERE employee_id = 'DRV001'), 1, '07:30:00', '07:45:00', 15, true),
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM buses WHERE bus_number = '2'), (SELECT id FROM drivers WHERE employee_id = 'DRV002'), 1, '06:45:00', '07:05:00', 20, true),
((SELECT id FROM routes WHERE route_number = '2'), (SELECT id FROM buses WHERE bus_number = '2'), (SELECT id FROM drivers WHERE employee_id = 'DRV002'), 1, '07:15:00', '07:35:00', 20, true);

-- Insert admin user for testing
INSERT INTO admin_users (username, email, password_hash, full_name, role, permissions, is_active) VALUES
('admin', 'admin@bhutanbus.bt', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LFvFO', 'System Administrator', 'super_admin', '{"all": true}', true);
-- Password is: admin123

COMMIT;