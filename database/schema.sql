-- OTC Transaction System Database Schema
-- Created for Cardano OTC dApp

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admin users table
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ADA requests table (main OTC requests)
CREATE TABLE IF NOT EXISTS ada_requests (
    id VARCHAR(100) PRIMARY KEY,
    currency VARCHAR(10) NOT NULL DEFAULT 'ADA',
    amount_mode VARCHAR(20) NOT NULL CHECK (amount_mode IN ('fixed', 'sweep', 'rate_based')),
    amount_or_rule_json JSONB NOT NULL,
    recipient VARCHAR(100) NOT NULL, -- bech32 address
    ttl_slot BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' 
        CHECK (status IN ('REQUESTED', 'SIGNED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'EXPIRED')),
    created_by UUID NOT NULL REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-signed data table (witness and transaction body storage)
CREATE TABLE IF NOT EXISTS ada_presigned (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(100) NOT NULL REFERENCES ada_requests(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL, -- wallet provider (nami, eternl, etc.)
    tx_body_cbor TEXT NOT NULL, -- encrypted transaction body
    witness_cbor TEXT NOT NULL, -- encrypted witness
    selected_utxos JSONB NOT NULL, -- UTxOs used for this transaction
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction submissions table
CREATE TABLE IF NOT EXISTS ada_txs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(100) NOT NULL REFERENCES ada_requests(id) ON DELETE CASCADE,
    tx_hash VARCHAR(64) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED', 'CONFIRMED', 'FAILED')),
    fail_reason TEXT NULL
);

-- Audit log table for security and monitoring
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admins(id),
    action VARCHAR(100) NOT NULL, -- LOGIN, CREATE_REQUEST, SUBMIT_TX, etc.
    resource_type VARCHAR(50), -- request, transaction, etc.
    resource_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session management table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_ada_requests_status ON ada_requests(status);
CREATE INDEX IF NOT EXISTS idx_ada_requests_created_by ON ada_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_ada_requests_created_at ON ada_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_ada_requests_ttl_slot ON ada_requests(ttl_slot);

CREATE INDEX IF NOT EXISTS idx_ada_presigned_request_id ON ada_presigned(request_id);
CREATE INDEX IF NOT EXISTS idx_ada_presigned_signed_at ON ada_presigned(signed_at);

CREATE INDEX IF NOT EXISTS idx_ada_txs_request_id ON ada_txs(request_id);
CREATE INDEX IF NOT EXISTS idx_ada_txs_tx_hash ON ada_txs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_ada_txs_status ON ada_txs(status);
CREATE INDEX IF NOT EXISTS idx_ada_txs_submitted_at ON ada_txs(submitted_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- Updated timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_ada_requests_updated_at 
    BEFORE UPDATE ON ada_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at 
    BEFORE UPDATE ON admins 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample admin user (password: 'admin123' - change in production!)
-- Hash generated with bcrypt rounds=10
INSERT INTO admins (email, password_hash) 
VALUES ('admin@otc.local', '$2b$10$rQG5Zr5WoV5hFZyQb5nN1OeU9wO8qZl.gQ9yJ8XQ2ZpgQo.zZJzO.')
ON CONFLICT (email) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE ada_requests IS 'Main OTC request records with amount modes and TTL';
COMMENT ON TABLE ada_presigned IS 'Pre-signed transaction data with encrypted storage';
COMMENT ON TABLE ada_txs IS 'Transaction submission records and confirmation status';
COMMENT ON TABLE audit_logs IS 'Security audit trail for all admin operations';
COMMENT ON TABLE admin_sessions IS 'Active admin sessions with expiration management';

COMMENT ON COLUMN ada_requests.amount_mode IS 'fixed: exact amount, sweep: all ADA, rate_based: fiat conversion';
COMMENT ON COLUMN ada_requests.amount_or_rule_json IS 'JSON containing amount or calculation rules';
COMMENT ON COLUMN ada_requests.ttl_slot IS 'Cardano slot number when transaction expires';
COMMENT ON COLUMN ada_presigned.tx_body_cbor IS 'Encrypted CBOR-encoded transaction body';
COMMENT ON COLUMN ada_presigned.witness_cbor IS 'Encrypted CBOR-encoded witness set';
COMMENT ON COLUMN ada_presigned.selected_utxos IS 'JSON array of UTxOs selected for transaction';