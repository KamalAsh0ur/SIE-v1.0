-- Create API clients table for external integrations
CREATE TABLE public.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('sie_' || encode(gen_random_bytes(32), 'hex')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  allowed_endpoints TEXT[] DEFAULT ARRAY['ingest', 'jobs', 'insights', 'events'],
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create API usage logs for tracking
CREATE TABLE public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.api_clients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read for validation in edge functions (via service role)
CREATE POLICY "Service role can manage api_clients" ON public.api_clients FOR ALL USING (true);
CREATE POLICY "Service role can manage api_usage_logs" ON public.api_usage_logs FOR ALL USING (true);

-- Create function to validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(p_api_key TEXT, p_endpoint TEXT)
RETURNS TABLE(client_id UUID, client_name TEXT, is_valid BOOLEAN, rate_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.id,
    ac.name,
    (ac.is_active AND p_endpoint = ANY(ac.allowed_endpoints)) as is_valid,
    ac.rate_limit_per_minute
  FROM public.api_clients ac
  WHERE ac.api_key = p_api_key;
END;
$$;

-- Create function to log API usage
CREATE OR REPLACE FUNCTION public.log_api_usage(
  p_client_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER,
  p_response_time_ms INTEGER,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.api_usage_logs (client_id, endpoint, method, status_code, response_time_ms, ip_address)
  VALUES (p_client_id, p_endpoint, p_method, p_status_code, p_response_time_ms, p_ip_address)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_api_clients_updated_at
BEFORE UPDATE ON public.api_clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();