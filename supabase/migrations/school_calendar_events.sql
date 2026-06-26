-- School Calendar Events table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS school_calendar_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title        text NOT NULL,
  event_date   date NOT NULL,
  end_date     date,
  event_type   text DEFAULT 'event',
  -- term_start | term_end | mid_term | open_day | holiday | vacation | celebration | event
  term         text DEFAULT '',
  academic_year text DEFAULT '',
  description  text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE school_calendar_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write
CREATE POLICY "Authenticated full access" ON school_calendar_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anonymous users can read (for public-facing calendar views)
CREATE POLICY "Public read" ON school_calendar_events
  FOR SELECT TO anon USING (true);

-- Index for date-range queries
CREATE INDEX IF NOT EXISTS idx_school_calendar_event_date ON school_calendar_events (event_date);
CREATE INDEX IF NOT EXISTS idx_school_calendar_year       ON school_calendar_events (academic_year);
