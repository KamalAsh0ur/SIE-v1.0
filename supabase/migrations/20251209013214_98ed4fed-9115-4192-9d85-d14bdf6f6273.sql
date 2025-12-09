-- Enable realtime for all relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingestion_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.insights;