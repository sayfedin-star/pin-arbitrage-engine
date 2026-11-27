-- scripts/migrations/020_newborn_dossier_fleet_and_method_hygiene.sql
-- Version: 020 (newborn_dossier_fleet_and_method_hygiene)
--
-- Transaction-safe, idempotent live remediation:
--   1. Normalize synthetic 'organic_pin' and hydrated 'unhydrated_stub' values in public.newborn_candidates
--      to authentic 'pinterest_platform'.
--   2. Normalize synthetic 'organic_pin' and hydrated 'unhydrated_stub' values in public.universal_master_pins
--      to authentic 'pinterest_platform'.
--   3. Normalize polluted metadata JSONB creation_method / method keys in public.universal_master_pins.

-- 1. Normalize polluted raw_creation_method in newborn_candidates
UPDATE public.newborn_candidates
SET raw_creation_method = 'pinterest_platform'
WHERE LOWER(TRIM(COALESCE(raw_creation_method, ''))) IN ('organic_pin', 'unhydrated_stub')
   OR (is_hydrated = TRUE AND (raw_creation_method IS NULL OR btrim(raw_creation_method) = ''));

-- 2. Normalize polluted creation_method in universal_master_pins
UPDATE public.universal_master_pins
SET creation_method = 'pinterest_platform'
WHERE LOWER(TRIM(COALESCE(creation_method, ''))) = 'organic_pin'
   OR (is_hydrated = TRUE AND LOWER(TRIM(COALESCE(creation_method, ''))) IN ('unhydrated_stub', ''));

-- 3. Normalize polluted metadata JSONB creation_method / method keys in universal_master_pins
UPDATE public.universal_master_pins
SET metadata = jsonb_set(
  jsonb_set(COALESCE(metadata, '{}'::jsonb), '{creation_method}', '"pinterest_platform"'::jsonb, true),
  '{method}',
  '"pinterest_platform"'::jsonb,
  true
)
WHERE LOWER(TRIM(COALESCE(metadata->>'creation_method', ''))) = 'organic_pin'
   OR LOWER(TRIM(COALESCE(metadata->>'method', ''))) = 'organic_pin';
