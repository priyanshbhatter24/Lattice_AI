-- ══════════════════════════════════════════════════════════
-- Migration 001: Add User Authentication & Row Level Security
-- ══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor
--
-- Prerequisites:
-- 1. Create 'scripts' storage bucket in Supabase Dashboard > Storage
--    - Name: scripts
--    - Public: false (private)
-- ══════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════
-- STEP 1: Add user_id to projects table
-- ══════════════════════════════════════════════════════════

ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Index for RLS performance (99.94% improvement per Supabase docs)
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects USING btree (user_id);


-- ══════════════════════════════════════════════════════════
-- STEP 2: Enable Row Level Security on all tables
-- ══════════════════════════════════════════════════════════

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════
-- STEP 3: Projects RLS Policies
-- User owns projects directly via user_id
-- ══════════════════════════════════════════════════════════

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can create own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own projects" ON projects
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);


-- ══════════════════════════════════════════════════════════
-- STEP 4: Scenes RLS Policies
-- Access via project ownership (use IN for performance)
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view scenes of own projects" ON scenes;
DROP POLICY IF EXISTS "Users can create scenes in own projects" ON scenes;
DROP POLICY IF EXISTS "Users can update scenes in own projects" ON scenes;
DROP POLICY IF EXISTS "Users can delete scenes in own projects" ON scenes;

CREATE POLICY "Users can view scenes of own projects" ON scenes
  FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can create scenes in own projects" ON scenes
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update scenes in own projects" ON scenes
  FOR UPDATE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete scenes in own projects" ON scenes
  FOR DELETE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));


-- ══════════════════════════════════════════════════════════
-- STEP 5: Location Candidates RLS Policies
-- Access via project ownership
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view candidates of own projects" ON location_candidates;
DROP POLICY IF EXISTS "Users can create candidates in own projects" ON location_candidates;
DROP POLICY IF EXISTS "Users can update candidates in own projects" ON location_candidates;
DROP POLICY IF EXISTS "Users can delete candidates in own projects" ON location_candidates;

CREATE POLICY "Users can view candidates of own projects" ON location_candidates
  FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can create candidates in own projects" ON location_candidates
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update candidates in own projects" ON location_candidates
  FOR UPDATE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete candidates in own projects" ON location_candidates
  FOR DELETE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));


-- ══════════════════════════════════════════════════════════
-- STEP 6: Bookings RLS Policies
-- Access via project ownership
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view bookings of own projects" ON bookings;
DROP POLICY IF EXISTS "Users can create bookings in own projects" ON bookings;
DROP POLICY IF EXISTS "Users can update bookings in own projects" ON bookings;
DROP POLICY IF EXISTS "Users can delete bookings in own projects" ON bookings;

CREATE POLICY "Users can view bookings of own projects" ON bookings
  FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can create bookings in own projects" ON bookings
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can update bookings in own projects" ON bookings
  FOR UPDATE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can delete bookings in own projects" ON bookings
  FOR DELETE TO authenticated
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = (SELECT auth.uid())
  ));


-- ══════════════════════════════════════════════════════════
-- STEP 7: Storage RLS Policies for scripts bucket
-- User-scoped folders: scripts/{user_id}/filename.pdf
-- ══════════════════════════════════════════════════════════

-- Note: Run these AFTER creating the 'scripts' bucket in Supabase Dashboard

DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own scripts" ON storage.objects;

CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scripts' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can view own scripts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scripts' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can delete own scripts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'scripts' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );


-- ══════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run these to check policies)
-- ══════════════════════════════════════════════════════════

-- Check RLS is enabled on tables:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- List all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname = 'public';
