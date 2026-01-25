-- ══════════════════════════════════════════════════════════
-- Migration 002: Add script_path column to projects
-- ══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor after migration 001
--
-- This migration adds a script_path column to the projects table
-- to store the path to the uploaded script in Supabase Storage.
-- ══════════════════════════════════════════════════════════

-- Add script_path column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS script_path TEXT;

-- Add comment for documentation
COMMENT ON COLUMN projects.script_path IS 'Path to the uploaded script file in Supabase Storage (e.g., "{user_id}/{timestamp}_{filename}")';
