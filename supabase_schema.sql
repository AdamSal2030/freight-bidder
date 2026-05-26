-- ============================================================
-- Freight Bidder — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Veritread loads scraped from the platform
CREATE TABLE IF NOT EXISTS loads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id          TEXT UNIQUE NOT NULL,
  load_number      TEXT,
  equipment_name   TEXT,
  origin           TEXT,
  destination      TEXT,
  length           TEXT,
  width            TEXT,
  height           TEXT,
  weight           TEXT,
  time_remaining   TEXT,
  scraped_at       TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT DEFAULT 'new'
  -- status values: new | estimating | pending_approval | approved | submitted | skipped | expired
);

-- AI rate estimates + bid decisions
CREATE TABLE IF NOT EXISTS bids (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id             TEXT NOT NULL REFERENCES loads(load_id) ON DELETE CASCADE,
  distance_miles      INT,
  trailer_type        TEXT,
  requires_permits    BOOLEAN DEFAULT FALSE,
  requires_pilot_cars BOOLEAN DEFAULT FALSE,
  carrier_rate        DECIMAL(10,2),
  margin_pct          DECIMAL(5,2),
  suggested_bid       DECIMAL(10,2),
  final_bid           DECIMAL(10,2),
  reasoning           TEXT,
  status              TEXT DEFAULT 'pending_approval',
  -- status values: pending_approval | approved | submitted | error | skipped
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- LTL quotes (WWEX / Speedship)
CREATE TABLE IF NOT EXISTS ltl_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin         TEXT NOT NULL,
  destination    TEXT NOT NULL,
  weight_lbs     INT,
  freight_class  TEXT,
  wwex_rate      DECIMAL(10,2),
  markup_pct     DECIMAL(5,2) DEFAULT 25,
  customer_rate  DECIMAL(10,2),
  notes          TEXT DEFAULT '',
  status         TEXT DEFAULT 'pending',
  -- status values: pending | completed | error
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_loads_status    ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_scraped   ON loads(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_load_id    ON bids(load_id);
CREATE INDEX IF NOT EXISTS idx_bids_status     ON bids(status);
CREATE INDEX IF NOT EXISTS idx_ltl_created     ON ltl_quotes(created_at DESC);

-- Enable Row Level Security (open for service-role key; anon read-only)
ALTER TABLE loads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ltl_quotes ENABLE ROW LEVEL SECURITY;

-- Allow all access via service role key (used by daemon + API routes)
CREATE POLICY "service_role_all_loads"      ON loads      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_bids"       ON bids       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ltl_quotes" ON ltl_quotes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon (browser) to read + write (the web app uses anon key)
CREATE POLICY "anon_all_loads"      ON loads      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bids"       ON bids       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ltl_quotes" ON ltl_quotes FOR ALL TO anon USING (true) WITH CHECK (true);
