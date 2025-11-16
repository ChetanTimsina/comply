-- Initial database migration
-- Run this script to create all tables

\i database/schemas/001_initial_schema.sql
\i database/schemas/002_auth_tables.sql
\i database/schemas/003_payments_table.sql

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email_phone ON users(email, phone_number);
CREATE INDEX IF NOT EXISTS idx_buses_location ON buses(current_latitude, current_longitude) WHERE current_latitude IS NOT NULL;

-- Create views for common queries
CREATE OR REPLACE VIEW active_buses_with_drivers AS
SELECT
    b.id, b.bus_number, b.registration_number, b.capacity,
    b.current_latitude, b.current_longitude, b.current_speed_kmh,
    d.full_name as driver_name, d.phone_number as driver_phone,
    r.route_number, r.route_name,
    CASE
        WHEN b.last_gps_update > NOW() - INTERVAL '5 minutes' THEN 'active'
        WHEN b.last_gps_update > NOW() - INTERVAL '30 minutes' THEN 'stale'
        ELSE 'offline'
    END as status
FROM buses b
LEFT JOIN drivers d ON b.current_driver_id = d.id
LEFT JOIN routes r ON b.current_route_id = r.id
WHERE b.is_active = true;

-- Create trigger for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN VALUES ('users', 'digital_cards', 'buses', 'drivers', 'routes', 'schedules', 'admin_users')
    LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                      table_name || '_updated_at_trigger', table_name);
    END LOOP;
END $$;