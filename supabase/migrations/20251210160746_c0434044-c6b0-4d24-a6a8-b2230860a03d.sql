-- Add ocr_text column to insights table for extracted image text
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS ocr_text text;

-- Add confidence_scores column to insights for NLP confidence tracking
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS confidence_scores jsonb DEFAULT '{}'::jsonb;