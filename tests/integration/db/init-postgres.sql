-- PostgreSQL initialization script for @hallaxius/auth integration tests
-- This script runs when the PostgreSQL container starts

-- Create test schema
CREATE SCHEMA IF NOT EXISTS auth_test;

-- Users table
CREATE TABLE IF NOT EXISTS auth_test.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    backup_codes TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS auth_test.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_test.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address INET
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS auth_test.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_test.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rate limit tracking
CREATE TABLE IF NOT EXISTS auth_test.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identifier, action, window_start)
);

-- Audit log for security events
CREATE TABLE IF NOT EXISTS auth_test.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    actor_user_id UUID REFERENCES auth_test.users(id),
    actor_ip INET,
    actor_user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth_test.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON auth_test.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth_test.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON auth_test.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON auth_test.password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON auth_test.rate_limits(identifier, action);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON auth_test.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON auth_test.audit_log(created_at);

-- Insert test data
INSERT INTO auth_test.users (email, username, password_hash, email_verified)
VALUES 
    ('test@example.com', 'testuser', '$2b$10$testhash', TRUE),
    ('admin@example.com', 'admin', '$2b$10$adminhash', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA auth_test TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth_test TO test;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth_test TO test;
