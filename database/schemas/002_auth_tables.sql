-- Additional tables for authentication system
-- Add to existing database schema

-- Verification OTPs table for phone/email verification
CREATE TABLE IF NOT EXISTS verification_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('phone', 'email')),
  target VARCHAR(255) NOT NULL, -- phone number or email address
  otp VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, type, is_used) -- One active OTP per user per type
);

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Token blacklist for invalidating tokens on logout
CREATE TABLE IF NOT EXISTS token_blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id VARCHAR(255) NOT NULL UNIQUE, -- JWT ID (jti)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reason VARCHAR(100) DEFAULT 'logout',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Login attempts for tracking and security
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier VARCHAR(255) NOT NULL, -- phone number or email
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),
  user_id UUID REFERENCES users(id), -- Populated on successful login
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for active session management
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id VARCHAR(255) NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_otps_user_type ON verification_otps(user_id, type);
CREATE INDEX IF NOT EXISTS idx_verification_otps_target ON verification_otps(target);
CREATE INDEX IF NOT EXISTS idx_verification_otps_expires ON verification_otps(expires_at);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_success ON login_attempts(success);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_activity ON user_sessions(last_activity);

-- Create trigger to update user_sessions.updated_at
CREATE OR REPLACE FUNCTION update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_sessions_updated_at_trigger ON user_sessions;
CREATE TRIGGER update_user_sessions_updated_at_trigger
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_sessions_updated_at();

-- Function to clean up expired records
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
    -- Delete expired OTPs
    DELETE FROM verification_otps WHERE expires_at < NOW() - INTERVAL '1 hour';

    -- Delete expired password resets
    DELETE FROM password_resets WHERE expires_at < NOW() - INTERVAL '1 day';

    -- Delete expired token blacklist entries
    DELETE FROM token_blacklist WHERE expires_at < NOW();

    -- Delete old login attempts (keep last 30 days)
    DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '30 days';

    -- Delete inactive sessions (older than 30 days)
    DELETE FROM user_sessions
    WHERE is_active = false
    AND updated_at < NOW() - INTERVAL '30 days';

    RAISE NOTICE 'Expired authentication data cleaned up';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- This is optional and depends on your PostgreSQL setup
-- SELECT cron.schedule('cleanup-auth-data', '0 2 * * *', 'SELECT cleanup_expired_auth_data();');

-- Add comments
COMMENT ON TABLE verification_otps IS 'OTP codes for phone and email verification';
COMMENT ON TABLE password_resets IS 'Password reset OTP codes';
COMMENT ON TABLE token_blacklist IS 'Blacklisted JWT tokens for logout/unauthorized access';
COMMENT ON TABLE login_attempts IS 'Track login attempts for security monitoring';
COMMENT ON TABLE user_sessions IS 'Active user sessions for multi-device management';