-- Migration: Fix request ID type from UUID to VARCHAR
-- This migration changes the ada_requests.id column from UUID to VARCHAR(100)
-- to support custom request ID format like 'req_1753846562941_4bi0zm7x4'

BEGIN;

-- Step 1: Change ada_requests.id column type
ALTER TABLE ada_requests ALTER COLUMN id TYPE VARCHAR(100);

-- Step 2: Fix ada_presigned table
-- Drop existing foreign key constraint
ALTER TABLE ada_presigned DROP CONSTRAINT IF EXISTS ada_presigned_request_id_fkey;
-- Change column type
ALTER TABLE ada_presigned ALTER COLUMN request_id TYPE VARCHAR(100);
-- Recreate foreign key constraint
ALTER TABLE ada_presigned ADD CONSTRAINT ada_presigned_request_id_fkey 
    FOREIGN KEY (request_id) REFERENCES ada_requests(id) ON DELETE CASCADE;

-- Step 3: Fix ada_txs table
-- Drop existing foreign key constraint
ALTER TABLE ada_txs DROP CONSTRAINT IF EXISTS ada_txs_request_id_fkey;
-- Change column type
ALTER TABLE ada_txs ALTER COLUMN request_id TYPE VARCHAR(100);
-- Recreate foreign key constraint
ALTER TABLE ada_txs ADD CONSTRAINT ada_txs_request_id_fkey 
    FOREIGN KEY (request_id) REFERENCES ada_requests(id) ON DELETE CASCADE;

-- Step 4: Fix audit_logs table resource_id column
ALTER TABLE audit_logs ALTER COLUMN resource_id TYPE VARCHAR(100);

-- Step 5: Update comments
COMMENT ON COLUMN ada_requests.id IS 'Custom request ID in format req_timestamp_randomstring';

COMMIT;