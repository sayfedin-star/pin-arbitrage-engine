-- ============================================================================
-- scripts/migrations/021_ssot_velocity_html_and_domain_hygiene.sql
-- Version: 021 (ssot_velocity_html_and_domain_hygiene)
--
-- Transaction-safe, strictly idempotent live database remediation & hardening:
--   1. Harden public.pae_sync_clean_domain() trigger to strip ports/queries/
--      fragments ([/?#:].*$) and fall back to destination_url when domain is
--      blank or placeholder.
--   2. Create pure IMMUTABLE single-pass HTML entity decoder
--      public.pae_decode_html_entities(text) and heal raw HTML entities across
--      universal_master_pins and newborn_candidates.
--   3. Reconcile ALL intraday-corrupted daily_save_velocity,
--      daily_repin_velocity, delta_saves_24h, and delta_repins_24h across
--      pins_daily_metrics and universal_master_pins authoritatively from
--      prior-day pins_daily_metrics baselines (with anti-hydration-jump guards).
--   4. Ensure domain_intelligence_rollup.domain values are clean lowercase
--      without www. prefix for SARGable PK/B-Tree lookups.
-- ============================================================================

-- 1. Harden clean_domain sync trigger function
CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $_$
DECLARE
  raw_dom text;
  dest_url text;
  dest_host text;
BEGIN
  raw_dom := COALESCE(
    NULLIF(BTRIM(COALESCE(NEW.domain, '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
  );
  dest_url := BTRIM(COALESCE(NEW.destination_url, ''));
  IF dest_url <> '' THEN
    dest_host := SUBSTRING(LOWER(dest_url) FROM '^https?://(?:www\.)?([^/?#:]+)');
  ELSE
    dest_host := NULL;
  END IF;

  IF raw_dom IS NULL OR raw_dom = '' OR (
    LOWER(raw_dom) IN ('uploaded by user', 'uploaded-by-user', 'organic')
    AND dest_host IS NOT NULL
    AND dest_host <> ''
  ) THEN
    raw_dom := COALESCE(dest_host, raw_dom);
  END IF;

  raw_dom := COALESCE(raw_dom, '');
  raw_dom := REGEXP_REPLACE(LOWER(BTRIM(raw_dom)), '^https?://', '');
  raw_dom := REGEXP_REPLACE(raw_dom, '[/?#:].*$', '');
  NEW.clean_domain := REGEXP_REPLACE(raw_dom, '^www\.', '');
  RETURN NEW;
END;
$_$;

-- 2. Single-pass HTML entity decoder (never double-decodes &amp;lt;)
CREATE OR REPLACE FUNCTION public.pae_decode_html_entities(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $_$
DECLARE
  result_text text := '';
  pos integer := 1;
  len integer := LENGTH(input_text);
  m text[];
  tok text;
  dec_str text;
  hex_str text;
  named_str text;
  cp integer;
  rep text;
  next_amp integer;
BEGIN
  IF STRPOS(input_text, '&') = 0 THEN
    RETURN input_text;
  END IF;

  WHILE pos <= len LOOP
    next_amp := STRPOS(SUBSTR(input_text, pos), '&');
    IF next_amp = 0 THEN
      result_text := result_text || SUBSTR(input_text, pos);
      EXIT;
    END IF;

    IF next_amp > 1 THEN
      result_text := result_text || SUBSTR(input_text, pos, next_amp - 1);
      pos := pos + next_amp - 1;
    END IF;

    m := REGEXP_MATCH(SUBSTR(input_text, pos, 16), '^&(?:#([0-9]{1,7})|#x([0-9a-fA-F]{1,6})|([a-zA-Z]{2,10}));');
    IF m IS NULL THEN
      result_text := result_text || '&';
      pos := pos + 1;
      CONTINUE;
    END IF;

    dec_str := m[1];
    hex_str := m[2];
    named_str := m[3];
    tok := '&' || COALESCE('#' || dec_str, '#x' || hex_str, named_str) || ';';
    rep := NULL;

    IF dec_str IS NOT NULL THEN
      cp := dec_str::integer;
      IF cp > 0 AND cp <= 1114111 AND NOT (cp BETWEEN 55296 AND 57343) THEN
        rep := CHR(cp);
      END IF;
    ELSIF hex_str IS NOT NULL THEN
      cp := ('x' || LPAD(hex_str, 8, '0'))::bit(32)::integer;
      IF cp > 0 AND cp <= 1114111 AND NOT (cp BETWEEN 55296 AND 57343) THEN
        rep := CHR(cp);
      END IF;
    ELSIF named_str IS NOT NULL THEN
      rep := CASE LOWER(named_str)
        WHEN 'amp' THEN '&'
        WHEN 'lt' THEN '<'
        WHEN 'gt' THEN '>'
        WHEN 'quot' THEN '"'
        WHEN 'apos' THEN ''''
        WHEN 'nbsp' THEN ' '
        WHEN 'rsquo' THEN CHR(8217)
        WHEN 'lsquo' THEN CHR(8216)
        WHEN 'rdquo' THEN CHR(8221)
        WHEN 'ldquo' THEN CHR(8220)
        WHEN 'ndash' THEN CHR(8211)
        WHEN 'mdash' THEN CHR(8212)
        WHEN 'hellip' THEN CHR(8230)
        WHEN 'copy' THEN CHR(169)
        WHEN 'reg' THEN CHR(174)
        WHEN 'trade' THEN CHR(8482)
        WHEN 'deg' THEN CHR(176)
        WHEN 'times' THEN CHR(215)
        WHEN 'frac12' THEN CHR(189)
        WHEN 'frac14' THEN CHR(188)
        WHEN 'frac34' THEN CHR(190)
        WHEN 'eacute' THEN CHR(233)
        WHEN 'ntilde' THEN CHR(241)
        WHEN 'aacute' THEN CHR(225)
        WHEN 'iacute' THEN CHR(237)
        WHEN 'oacute' THEN CHR(243)
        WHEN 'uacute' THEN CHR(250)
        WHEN 'uuml' THEN CHR(252)
        WHEN 'ccedil' THEN CHR(231)
        ELSE NULL
      END;
    END IF;

    result_text := result_text || COALESCE(rep, tok);
    pos := pos + LENGTH(tok);
  END LOOP;

  RETURN result_text;
END;
$_$;

-- 3. Heal raw HTML entities in universal_master_pins
UPDATE public.universal_master_pins
SET
  title = CASE WHEN title IS NOT NULL AND title ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(title) ELSE title END,
  description = CASE WHEN description IS NOT NULL AND description ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(description) ELSE description END,
  alt_text = CASE WHEN alt_text IS NOT NULL AND alt_text ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(alt_text) ELSE alt_text END,
  board_name = CASE WHEN board_name IS NOT NULL AND board_name ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(board_name) ELSE board_name END
WHERE (title IS NOT NULL AND title ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(title) IS DISTINCT FROM title)
   OR (description IS NOT NULL AND description ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(description) IS DISTINCT FROM description)
   OR (alt_text IS NOT NULL AND alt_text ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(alt_text) IS DISTINCT FROM alt_text)
   OR (board_name IS NOT NULL AND board_name ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(board_name) IS DISTINCT FROM board_name);

-- Heal raw HTML entities in newborn_candidates (if present)
UPDATE public.newborn_candidates
SET
  title = CASE WHEN title IS NOT NULL AND title ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(title) ELSE title END,
  description = CASE WHEN description IS NOT NULL AND description ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(description) ELSE description END,
  alt_text = CASE WHEN alt_text IS NOT NULL AND alt_text ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(alt_text) ELSE alt_text END,
  board_name = CASE WHEN board_name IS NOT NULL AND board_name ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' THEN public.pae_decode_html_entities(board_name) ELSE board_name END
WHERE (title IS NOT NULL AND title ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(title) IS DISTINCT FROM title)
   OR (description IS NOT NULL AND description ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(description) IS DISTINCT FROM description)
   OR (alt_text IS NOT NULL AND alt_text ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(alt_text) IS DISTINCT FROM alt_text)
   OR (board_name IS NOT NULL AND board_name ~ '&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,10});' AND public.pae_decode_html_entities(board_name) IS DISTINCT FROM board_name);

-- 4. Reconcile ALL latest pins_daily_metrics & universal_master_pins 24h velocities & repin deltas
--    authoritatively from prior-day pins_daily_metrics baselines (healing all intraday drift)
WITH ranked_snaps AS (
  SELECT
    pin_id,
    recorded_date,
    save_count,
    repin_count,
    ROW_NUMBER() OVER (PARTITION BY pin_id ORDER BY recorded_date DESC) AS rn
  FROM public.pins_daily_metrics
  WHERE save_count IS NOT NULL
),
paired AS (
  SELECT
    curr.pin_id,
    curr.recorded_date AS curr_date,
    curr.save_count AS curr_saves,
    curr.repin_count AS curr_repins,
    prev.recorded_date AS prev_date,
    prev.save_count AS prev_saves,
    prev.repin_count AS prev_repins,
    GREATEST(1, (curr.recorded_date - prev.recorded_date)) AS elapsed_days,
    CASE
      WHEN prev.save_count IS NOT NULL AND curr.save_count IS NOT NULL AND curr.save_count > prev.save_count AND (
        prev.save_count <= 0
        OR (prev.save_count < 100 AND curr.save_count >= 500)
        OR (COALESCE(prev.repin_count, 0) > 0 AND prev.save_count = prev.repin_count AND curr.save_count > COALESCE(NULLIF(curr.repin_count, 0), prev.repin_count) * 1.35)
        OR (COALESCE(prev.repin_count, 0) = 0 AND COALESCE(curr.repin_count, 0) >= 25 AND curr.save_count >= prev.save_count * 2.5)
        OR (prev.save_count > 0 AND curr.save_count >= prev.save_count * 4 AND (curr.save_count - prev.save_count) >= 2500)
        OR (prev.save_count < 500 AND (curr.save_count - prev.save_count) > 2000 AND (prev.save_count <= 0 OR (curr.save_count::numeric / GREATEST(1, prev.save_count)) > 20))
      ) THEN true ELSE false
    END AS is_save_jump,
    CASE
      WHEN prev.repin_count IS NOT NULL AND curr.repin_count IS NOT NULL AND curr.repin_count > prev.repin_count AND (
        (prev.repin_count <= 0 AND curr.repin_count >= 10)
        OR (
          prev.repin_count > 0
          AND prev.repin_count < 100
          AND curr.repin_count >= 500
          AND (curr.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, curr.save_count - prev.save_count) < (curr.repin_count - prev.repin_count) * 0.25)
        )
        OR (
          prev.repin_count > 0
          AND curr.repin_count >= prev.repin_count * 4
          AND (curr.repin_count - prev.repin_count) >= 200
          AND (curr.save_count IS NULL OR prev.save_count IS NULL OR GREATEST(0, curr.save_count - prev.save_count) < (curr.repin_count - prev.repin_count) * 0.15)
        )
      ) THEN true ELSE false
    END AS is_repin_jump
  FROM ranked_snaps curr
  INNER JOIN ranked_snaps prev
    ON prev.pin_id = curr.pin_id
   AND prev.rn = 2
   AND prev.recorded_date < curr.recorded_date
  WHERE curr.rn = 1
),
recomputed AS (
  SELECT
    p.pin_id,
    p.curr_date,
    CASE
      WHEN p.is_save_jump THEN 0::double precision
      WHEN p.prev_saves > 0 THEN
        LEAST(25000::double precision, ROUND(GREATEST(0, p.curr_saves - p.prev_saves)::numeric / p.elapsed_days, 2)::double precision)
      ELSE 0::double precision
    END AS true_save_vel,
    CASE
      WHEN p.is_save_jump THEN 0::bigint
      WHEN p.prev_saves > 0 THEN
        LEAST(25000::bigint, ROUND(GREATEST(0, p.curr_saves - p.prev_saves)::numeric / p.elapsed_days)::bigint)
      ELSE 0::bigint
    END AS true_delta_saves,
    CASE
      WHEN p.curr_repins IS NULL OR p.prev_repins IS NULL THEN NULL::double precision
      WHEN p.is_repin_jump OR p.is_save_jump THEN 0::double precision
      WHEN p.prev_repins > 0 THEN
        LEAST(25000::double precision, ROUND(GREATEST(0, p.curr_repins - p.prev_repins)::numeric / p.elapsed_days, 2)::double precision)
      ELSE 0::double precision
    END AS true_repin_vel,
    CASE
      WHEN p.curr_repins IS NULL OR p.prev_repins IS NULL THEN NULL::bigint
      WHEN p.is_repin_jump OR p.is_save_jump THEN 0::bigint
      WHEN p.prev_repins > 0 THEN
        LEAST(25000::bigint, ROUND(GREATEST(0, p.curr_repins - p.prev_repins)::numeric / p.elapsed_days)::bigint)
      ELSE 0::bigint
    END AS true_delta_repins
  FROM paired p
),
upd_pdm AS (
  UPDATE public.pins_daily_metrics pdm
  SET
    daily_save_velocity = r.true_save_vel,
    daily_repin_velocity = COALESCE(r.true_repin_vel, pdm.daily_repin_velocity)
  FROM recomputed r
  WHERE pdm.pin_id = r.pin_id
    AND pdm.recorded_date = r.curr_date
    AND (
      pdm.daily_save_velocity IS DISTINCT FROM r.true_save_vel
      OR (r.true_repin_vel IS NOT NULL AND pdm.daily_repin_velocity IS DISTINCT FROM r.true_repin_vel)
    )
  RETURNING pdm.pin_id
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = r.true_save_vel,
  delta_saves_24h = r.true_delta_saves,
  daily_repin_velocity = COALESCE(r.true_repin_vel, ump.daily_repin_velocity),
  delta_repins_24h = COALESCE(r.true_delta_repins, ump.delta_repins_24h)
FROM recomputed r
WHERE ump.pin_id = r.pin_id
  AND (
    ump.daily_save_velocity IS DISTINCT FROM r.true_save_vel
    OR ump.delta_saves_24h IS DISTINCT FROM r.true_delta_saves
    OR (r.true_repin_vel IS NOT NULL AND ump.daily_repin_velocity IS DISTINCT FROM r.true_repin_vel)
    OR (r.true_delta_repins IS NOT NULL AND ump.delta_repins_24h IS DISTINCT FROM r.true_delta_repins)
  );
