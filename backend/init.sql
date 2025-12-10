-- SIE Database Initialization Script
-- Creates the required tables for the Smart Ingestion Engine

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Enums
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM (
        'pending', 'ingesting', 'processing', 'enriching', 'completed', 'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE platform_type AS ENUM (
        'meta_api', 'youtube_api', 'scraped', 'twitter', 'reddit', 'linkedin', 'instagram', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sentiment_type AS ENUM (
        'positive', 'negative', 'neutral', 'mixed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_priority AS ENUM (
        'low', 'normal', 'high'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Tables
-- ============================================================================

-- Ingestion Jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant VARCHAR(255) NOT NULL,
    source_type platform_type NOT NULL,
    status job_status NOT NULL DEFAULT 'pending',
    priority job_priority NOT NULL DEFAULT 'normal',
    mode VARCHAR(50) NOT NULL DEFAULT 'realtime',
    
    -- Request data
    accounts TEXT[],
    keywords TEXT[],
    date_range JSONB,
    
    -- Progress tracking
    items_total INTEGER DEFAULT 0,
    items_processed INTEGER DEFAULT 0,
    items_success INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    progress_percent DECIMAL(5,2) DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metrics
    processing_time_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insights (Normalized Posts)
CREATE TABLE IF NOT EXISTS insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
    tenant VARCHAR(255) NOT NULL,
    
    -- Original post data
    post_id VARCHAR(255),
    content_text TEXT NOT NULL,
    ocr_text TEXT,
    
    -- Author info
    author_name VARCHAR(255),
    author_id VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    
    -- NLP results
    sentiment sentiment_type NOT NULL DEFAULT 'neutral',
    sentiment_score DECIMAL(5,4),
    entities JSONB DEFAULT '[]',
    topics TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    language VARCHAR(10) DEFAULT 'en',
    
    -- Provenance
    source_url TEXT,
    platform VARCHAR(50),
    fetch_method VARCHAR(50),
    original_id VARCHAR(255),
    
    -- Quality
    confidence_scores JSONB DEFAULT '{}',
    is_spam BOOLEAN DEFAULT false,
    is_duplicate BOOLEAN DEFAULT false,
    
    -- Media
    media JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pipeline Events
CREATE TABLE IF NOT EXISTS pipeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
    tenant VARCHAR(255),
    
    event_type VARCHAR(100) NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Clients
CREATE TABLE IF NOT EXISTS api_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) NOT NULL UNIQUE,
    tenant VARCHAR(255) NOT NULL,
    
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 60,
    allowed_endpoints TEXT[] DEFAULT ARRAY['*'],
    webhook_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Usage Logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
    
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON ingestion_jobs(tenant);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON ingestion_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insights_job_id ON insights(job_id);
CREATE INDEX IF NOT EXISTS idx_insights_tenant ON insights(tenant);
CREATE INDEX IF NOT EXISTS idx_insights_sentiment ON insights(sentiment);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_job_id ON pipeline_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON pipeline_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_clients_key ON api_clients(api_key);
CREATE INDEX IF NOT EXISTS idx_api_usage_client ON api_usage_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_logs(created_at DESC);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_jobs_updated_at ON ingestion_jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON ingestion_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON api_clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON api_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample Data (for development)
-- ============================================================================

-- Create a test API client
INSERT INTO api_clients (name, api_key, tenant, description)
VALUES ('Development Client', 'dev-api-key-12345', 'default', 'Default development API client')
ON CONFLICT (api_key) DO NOTHING;

COMMIT;
