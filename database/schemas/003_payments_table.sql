-- Additional payment-related tables for the payment system
-- Add to existing database schema

-- Payments table for tracking all payment attempts
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BTN',
  payment_method VARCHAR(50) NOT NULL, -- 'mobile_wallet', 'bank_card', 'qr_code'
  gateway VARCHAR(20) NOT NULL, -- 'bob', 'bnb', 'stripe'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  gateway_transaction_id VARCHAR(255), -- Transaction ID from payment gateway
  payment_url TEXT, -- URL for user to complete payment
  gateway_response JSONB, -- Full response from gateway
  metadata JSONB, -- Additional payment metadata
  refund_id VARCHAR(255), -- ID of refund transaction if applicable
  refund_reason TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Physical cards table (for linking physical smart cards)
CREATE TABLE IF NOT EXISTS physical_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_number VARCHAR(16) UNIQUE NOT NULL,
  cid_number VARCHAR(11), -- Bhutan Citizen ID of card holder
  card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('regular', 'student', 'disabled', 'senior')),
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_linked BOOLEAN DEFAULT false,
  linked_to_user UUID REFERENCES users(id),
  linked_at TIMESTAMP WITH TIME ZONE,
  last_balance DECIMAL(10,2) DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment methods configuration table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway VARCHAR(20) NOT NULL UNIQUE,
  method_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  supports_refund BOOLEAN DEFAULT false,
  fee_percentage DECIMAL(5,4) DEFAULT 0, -- e.g., 0.0290 for 2.9%
  fee_fixed DECIMAL(10,2) DEFAULT 0, -- e.g., 0.30 for 30 cents
  min_amount DECIMAL(10,2) DEFAULT 10,
  max_amount DECIMAL(10,2) DEFAULT 5000,
  supported_currencies TEXT[] DEFAULT '{BTN}', -- Array of supported currencies
  config JSONB, -- Gateway-specific configuration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment limits table for different user types
CREATE TABLE IF NOT EXISTS payment_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_type VARCHAR(20) NOT NULL, -- 'regular', 'student', 'tourist'
  daily_limit DECIMAL(10,2) NOT NULL,
  weekly_limit DECIMAL(10,2) NOT NULL,
  monthly_limit DECIMAL(10,2) NOT NULL,
  max_transaction_amount DECIMAL(10,2) NOT NULL,
  min_transaction_amount DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment audit log for security and compliance
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'initiated', 'completed', 'failed', 'refunded', 'disputed'
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  amount DECIMAL(10,2),
  gateway VARCHAR(20),
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exchange rates table for international payments
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(12,6) NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'central_bank', 'market', 'fixed'
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_processed_at ON payments(processed_at);

CREATE INDEX IF NOT EXISTS idx_physical_cards_number ON physical_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_physical_cards_cid ON physical_cards(cid_number);
CREATE INDEX IF NOT EXISTS idx_physical_cards_linked ON physical_cards(is_linked);
CREATE INDEX IF NOT EXISTS idx_physical_cards_user ON physical_cards(linked_to_user);

CREATE INDEX IF NOT EXISTS idx_payment_methods_gateway ON payment_methods(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

CREATE INDEX IF NOT EXISTS idx_payment_limits_type ON payment_limits(user_type);
CREATE INDEX IF NOT EXISTS idx_payment_limits_active ON payment_limits(is_active);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_payment_id ON payment_audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_log_user_id ON payment_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_log_action ON payment_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_payment_audit_log_created_at ON payment_audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_pair ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_effective_date ON exchange_rates(effective_date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_active ON exchange_rates(is_active);

-- Create trigger to update payments.updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_payments_updated_at_trigger ON payments;
CREATE TRIGGER update_payments_updated_at_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

-- Create trigger for payment audit logging
CREATE OR REPLACE FUNCTION log_payment_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log payment status changes
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO payment_audit_log (
            payment_id, user_id, action, old_status, new_status,
            amount, gateway, created_at
        ) VALUES (
            NEW.id, NEW.user_id, 'status_changed', OLD.status, NEW.status,
            NEW.amount, NEW.gateway, NOW()
        );
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO payment_audit_log (
            payment_id, user_id, action, new_status,
            amount, gateway, created_at
        ) VALUES (
            NEW.id, NEW.user_id, 'initiated', NEW.status,
            NEW.amount, NEW.gateway, NOW()
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_audit_trigger
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION log_payment_changes();

-- Create trigger for physical_cards.updated_at
CREATE OR REPLACE FUNCTION update_physical_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_physical_cards_updated_at_trigger ON physical_cards;
CREATE TRIGGER update_physical_cards_updated_at_trigger
    BEFORE UPDATE ON physical_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_physical_cards_updated_at();

-- Create trigger for payment_methods.updated_at
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_payment_methods_updated_at_trigger ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at_trigger
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_methods_updated_at();

-- Create trigger for payment_limits.updated_at
CREATE OR REPLACE FUNCTION update_payment_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_payment_limits_updated_at_trigger ON payment_limits;
CREATE TRIGGER update_payment_limits_updated_at_trigger
    BEFORE UPDATE ON payment_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_limits_updated_at();

-- Function to update payment statistics
CREATE OR REPLACE FUNCTION update_payment_statistics()
RETURNS void AS $$
BEGIN
    -- This function could be called periodically to update payment statistics
    -- Implementation depends on specific reporting requirements

    RAISE NOTICE 'Payment statistics updated';
END;
$$ LANGUAGE plpgsql;

-- Seed data for payment methods
INSERT INTO payment_methods (gateway, method_name, display_name, description, supports_refund, fee_percentage, fee_fixed, supported_currencies) VALUES
('bob', 'mobile_wallet', 'M-BOB Mobile Banking', 'Pay using Bank of Bhutan mobile banking app', true, 0, 0, ARRAY['BTN']),
('bob', 'qr_code', 'BOB QR Payment', 'Scan QR code with M-BOB app', true, 0, 0, ARRAY['BTN']),
('bnb', 'mobile_wallet', 'BNB Mobile Banking', 'Pay using Bhutan National Bank mobile banking', true, 0, 0, ARRAY['BTN']),
('bnb', 'qr_code', 'BNB QR Payment', 'Scan QR code with BNB mobile app', true, 0, 0, ARRAY['BTN']),
('stripe', 'bank_card', 'International Cards', 'Pay with Visa, Mastercard, Amex (for tourists)', true, 0.0290, 0.30, ARRAY['USD'])
ON CONFLICT (gateway) DO NOTHING;

-- Seed data for payment limits
INSERT INTO payment_limits (user_type, daily_limit, weekly_limit, monthly_limit, max_transaction_amount, min_transaction_amount) VALUES
('regular', 2000, 10000, 30000, 1000, 10),
('student', 1500, 7500, 20000, 1000, 10),
('tourist', 5000, 20000, 50000, 5000, 10)
ON CONFLICT (user_type) DO NOTHING;

-- Seed data for exchange rates
INSERT INTO exchange_rates (from_currency, to_currency, rate, source, effective_date) VALUES
('USD', 'BTN', 74.50, 'central_bank', CURRENT_DATE),
('EUR', 'BTN', 81.25, 'central_bank', CURRENT_DATE),
('GBP', 'BTN', 94.75, 'central_bank', CURRENT_DATE),
('INR', 'BTN', 0.90, 'central_bank', CURRENT_DATE)
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- Add comments
COMMENT ON TABLE payments IS 'Payment transactions and their status';
COMMENT ON TABLE physical_cards IS 'Physical smart card information for linking with digital cards';
COMMENT ON TABLE payment_methods IS 'Available payment methods and their configuration';
COMMENT ON TABLE payment_limits IS 'Payment limits by user type';
COMMENT ON TABLE payment_audit_log IS 'Audit log for all payment activities';
COMMENT ON TABLE exchange_rates IS 'Exchange rates for international payments';