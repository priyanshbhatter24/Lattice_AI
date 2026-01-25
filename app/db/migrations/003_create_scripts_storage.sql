-- ══════════════════════════════════════════════════════════
-- Migration 003: Create scripts storage bucket with RLS
-- ══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor after migration 002
--
-- This migration creates a storage bucket for screenplay PDFs
-- and sets up RLS policies so users can only access their own files.
-- ══════════════════════════════════════════════════════════

-- Create the scripts storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scripts',
  'scripts',
  false,  -- private bucket
  52428800,  -- 50MB max file size
  ARRAY['application/pdf']::text[]  -- only PDFs allowed
)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- RLS Policies for scripts bucket
-- ══════════════════════════════════════════════════════════

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Users can upload scripts to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own scripts" ON storage.objects;

-- Policy: Users can upload files to their own folder
-- Path pattern: {user_id}/{filename}
CREATE POLICY "Users can upload scripts to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scripts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can read their own files
CREATE POLICY "Users can read own scripts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'scripts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own scripts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scripts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own scripts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'scripts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
