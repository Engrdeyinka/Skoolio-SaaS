-- Create vault_schema table
CREATE TABLE IF NOT EXISTS public.vault_schema (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  required BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default schema fields
INSERT INTO public.vault_schema (label, key, required) VALUES
  ('Registration Number', 'registration_number', false),
  ('Centre Code', 'centre_code', false),
  ('School Address', 'school_address', false),
  ('Principal Name', 'principal_name', false),
  ('Contact Email', 'contact_email', false),
  ('Contact Phone', 'contact_phone', false)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.vault_schema ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read" ON public.vault_schema
  FOR SELECT USING (true);
