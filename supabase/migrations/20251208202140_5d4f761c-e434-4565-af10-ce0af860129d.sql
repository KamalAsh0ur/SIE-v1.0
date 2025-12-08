-- Create enum types for job status and platform
CREATE TYPE public.job_status AS ENUM ('pending', 'ingesting', 'processing', 'enriching', 'completed', 'failed');
CREATE TYPE public.platform_type AS ENUM ('twitter', 'reddit', 'news', 'linkedin', 'instagram', 'youtube', 'custom');
CREATE TYPE public.sentiment_type AS ENUM ('positive', 'negative', 'neutral', 'mixed');

-- Ingestion Jobs table
CREATE TABLE public.ingestion_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT NOT NULL,
  platform platform_type NOT NULL DEFAULT 'custom',
  status job_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  metadata JSONB DEFAULT '{}',
  raw_content TEXT,
  error_message TEXT,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Insights table for processed data
CREATE TABLE public.insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE,
  sentiment sentiment_type NOT NULL DEFAULT 'neutral',
  sentiment_score DECIMAL(5,4) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  entities JSONB DEFAULT '[]',
  keywords TEXT[] DEFAULT '{}',
  summary TEXT,
  topics TEXT[] DEFAULT '{}',
  engagement_metrics JSONB DEFAULT '{}',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Events table for real-time event streaming
CREATE TABLE public.pipeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_jobs_status ON public.ingestion_jobs(status);
CREATE INDEX idx_jobs_platform ON public.ingestion_jobs(platform);
CREATE INDEX idx_jobs_created_at ON public.ingestion_jobs(created_at DESC);
CREATE INDEX idx_insights_job_id ON public.insights(job_id);
CREATE INDEX idx_insights_sentiment ON public.insights(sentiment);
CREATE INDEX idx_events_job_id ON public.pipeline_events(job_id);
CREATE INDEX idx_events_created_at ON public.pipeline_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

-- Public read access policies (for dashboard viewing - can be restricted later with auth)
CREATE POLICY "Allow public read access to jobs"
ON public.ingestion_jobs FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to jobs"
ON public.ingestion_jobs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update access to jobs"
ON public.ingestion_jobs FOR UPDATE
USING (true);

CREATE POLICY "Allow public read access to insights"
ON public.insights FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to insights"
ON public.insights FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public read access to events"
ON public.pipeline_events FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to events"
ON public.pipeline_events FOR INSERT
WITH CHECK (true);

-- Trigger for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ingestion_jobs_updated_at
BEFORE UPDATE ON public.ingestion_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log pipeline events
CREATE OR REPLACE FUNCTION public.log_pipeline_event(
  p_job_id UUID,
  p_event_type TEXT,
  p_stage TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.pipeline_events (job_id, event_type, stage, message, metadata)
  VALUES (p_job_id, p_event_type, p_stage, p_message, p_metadata)
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;