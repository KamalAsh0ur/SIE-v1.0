-- Fix function search path for security
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;