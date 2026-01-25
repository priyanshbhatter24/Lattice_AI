-- Location Scout AI - Initial Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Scripts table
create table if not exists scripts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Scenes table
create table if not exists scenes (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid references scripts(id) on delete cascade,
  slugline text,
  int_ext text,
  time_of_day text,
  description text,
  mood text,
  period text,
  requirements jsonb default '[]',
  scene_number int,
  created_at timestamptz default now()
);

-- Locations table
create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  source text,
  source_id text,
  name text,
  address text,
  coordinates jsonb,
  description text,
  images jsonb default '[]',
  price text,
  amenities jsonb default '[]',
  contact jsonb,
  source_url text,
  scraped_at timestamptz default now()
);

-- Match scores table
create table if not exists match_scores (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid references scenes(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  visual_score int,
  functional_score int,
  logistics_score int,
  overall_score int,
  reasoning text,
  scored_at timestamptz default now()
);

-- Outreach logs table
create table if not exists outreach_logs (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references locations(id) on delete cascade,
  type text,
  status text,
  vapi_call_id text,
  transcript text,
  summary jsonb,
  availability text,
  quoted_price text,
  restrictions text,
  next_steps text,
  called_at timestamptz default now()
);

-- Create indexes for common queries
create index if not exists idx_scenes_script_id on scenes(script_id);
create index if not exists idx_match_scores_scene_id on match_scores(scene_id);
create index if not exists idx_match_scores_location_id on match_scores(location_id);
create index if not exists idx_match_scores_overall on match_scores(overall_score desc);
create index if not exists idx_outreach_logs_location_id on outreach_logs(location_id);
create index if not exists idx_locations_source on locations(source);

-- Enable realtime for all tables
alter publication supabase_realtime add table scripts;
alter publication supabase_realtime add table scenes;
alter publication supabase_realtime add table locations;
alter publication supabase_realtime add table match_scores;
alter publication supabase_realtime add table outreach_logs;
