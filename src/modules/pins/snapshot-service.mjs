/**
 * src/modules/pins/snapshot-service.mjs
 *
 * Domain service for Pin snapshot / intraday checkpoint deletion,
 * deleted_snapshot_dates tombstones, and bridged velocity reconciliation.
 */

import { detectHydrationJump, isRepinHydrationJump, calculateDailyVelocity } from '../../lib/math.mjs';

// Record deleted date in universal_master_pins
export async function recordDeletedSnapshotTombstone({ sql, pinId, targetDate }) {
  if (!sql || !targetDate) return;
  await sql`
    INSERT INTO universal_master_pins (pin_id, metadata, updated_at)
    VALUES (${pinId}, jsonb_build_object('deleted_snapshot_dates', jsonb_build_array(${targetDate})), NOW())
    ON CONFLICT (pin_id) DO UPDATE
    SET metadata = jsonb_set(
      COALESCE(universal_master_pins.metadata, '{}'::jsonb),
      '{deleted_snapshot_dates}',
      (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(COALESCE(universal_master_pins.metadata->'deleted_snapshot_dates', '[]'::jsonb) || to_jsonb(${targetDate}::text)) AS elem
      )
    ),
    updated_at = NOW();
  `;
}

/**
 * Reconciles a pin's bridged daily_save_velocity, daily_repin_velocity, save_count, and repin_count across
 * pins_daily_metrics and universal_master_pins after any snapshot deletion.
 */
export async function reconcilePinMetricsAfterSnapshotDelete({ sql, pinId }) {
  if (!sql || !pinId) return;
  const remainingRows = await sql`
    SELECT recorded_date, save_count, repin_count, comment_count, share_count, daily_save_velocity, daily_repin_velocity
    FROM pins_daily_metrics
    WHERE pin_id = ${pinId}
    ORDER BY recorded_date DESC
    LIMIT 30;
  `;

  if (!Array.isArray(remainingRows) || remainingRows.length === 0) {
    await sql`
      UPDATE universal_master_pins
      SET
        is_hydrated = FALSE,
        save_count = NULL,
        repin_count = NULL,
        daily_save_velocity = NULL,
        daily_repin_velocity = NULL,
        delta_saves_24h = NULL,
        delta_repins_24h = NULL,
        updated_at = NOW()
      WHERE pin_id = ${pinId};
    `;
    return;
  }

  // Chronological order (oldest -> newest) to recalculate bridged velocities
  const toDateKey = (val) => (val instanceof Date ? val.toISOString().slice(0, 10) : String(val || '').slice(0, 10));
  const chrono = [...remainingRows].sort((a, b) => toDateKey(a.recorded_date).localeCompare(toDateKey(b.recorded_date)));
  const updateBatch = [];
  for (let i = 0; i < chrono.length; i++) {
    const curr = chrono[i];
    const currDateStr = curr.recorded_date instanceof Date
      ? curr.recorded_date.toISOString().slice(0, 10)
      : String(curr.recorded_date).slice(0, 10);
    let newSaveVel = null;
    let newRepinVel = null;
    if (i > 0) {
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        if (chrono[j].save_count !== null) {
          prev = chrono[j];
          break;
        }
      }
      if (prev) {
        const prevDateStr = prev.recorded_date instanceof Date
          ? prev.recorded_date.toISOString().slice(0, 10)
          : String(prev.recorded_date).slice(0, 10);
        const daysDiff = Math.max(1, Math.round((new Date(currDateStr) - new Date(prevDateStr)) / 86400000));
        const isSaveJump = curr.save_count !== null && detectHydrationJump(prev, curr);
        if (curr.save_count !== null) {
          newSaveVel = isSaveJump
            ? 0
            : calculateDailyVelocity({
                currentSaves: Number(curr.save_count),
                baselineSaves: Number(prev.save_count),
                currentRepins: Number(curr.repin_count ?? 0),
                baselineRepins: Number(prev.repin_count ?? 0),
                currentDate: currDateStr,
                baselineDate: prevDateStr,
                maxCap: 25000
              });
        }
        if (curr.repin_count !== null && prev.repin_count !== null) {
          if (isSaveJump || isRepinHydrationJump(prev, curr)) {
            newRepinVel = 0;
          } else {
            const repinsDiff = Math.max(0, Number(curr.repin_count) - Number(prev.repin_count));
            newRepinVel = Math.min(25000, Math.round((repinsDiff / daysDiff) * 10) / 10);
          }
        }
      }
    }
    curr.recomputed_save_velocity = newSaveVel;
    curr.recomputed_repin_velocity = newRepinVel;
    updateBatch.push({
      recorded_date: currDateStr,
      daily_save_velocity: newSaveVel,
      daily_repin_velocity: newRepinVel
    });
  }

  if (updateBatch.length > 0) {
    await sql`
      UPDATE pins_daily_metrics pdm
      SET
        daily_save_velocity = u.daily_save_velocity,
        daily_repin_velocity = u.daily_repin_velocity
      FROM jsonb_to_recordset(${JSON.stringify(updateBatch)}::jsonb) AS u(
        recorded_date date,
        daily_save_velocity numeric,
        daily_repin_velocity numeric
      )
      WHERE pdm.pin_id = ${pinId} AND pdm.recorded_date = u.recorded_date;
    `;
  }

  const latest = chrono[chrono.length - 1];
  const latestSaves = latest.save_count !== null ? Number(latest.save_count) : null;
  const latestRepins = latest.repin_count !== null ? Number(latest.repin_count) : null;
  const latestSaveVel = latest.recomputed_save_velocity;
  const latestRepinVel = latest.recomputed_repin_velocity;
  const latestDeltaSaves = latestSaveVel !== null ? Math.round(latestSaveVel) : null;
  const latestDeltaRepins = latestRepinVel !== null ? Math.round(latestRepinVel) : null;

  await sql`
    UPDATE universal_master_pins
    SET
      save_count = ${latestSaves},
      repin_count = ${latestRepins},
      daily_save_velocity = ${latestSaveVel},
      daily_repin_velocity = ${latestRepinVel},
      delta_saves_24h = ${latestDeltaSaves},
      delta_repins_24h = ${latestDeltaRepins},
      updated_at = NOW()
    WHERE pin_id = ${pinId};
  `;
}

/**
 * Unified snapshot/checkpoint deletion helper across /api/pins/* and /api/creators/pin-snapshot.
 * Handles both intraday checkpoints (intra_ / intraday_ IDs) and YYYY-MM-DD daily snapshots
 * with intraday promotion, deleted_snapshot_dates tombstones, and metric reconciliation.
 */
export async function deletePinSnapshotByTarget({
  sql,
  pinId,
  rawTarget,
  fallbackDate = null,
  throwOnError = false,
  deleteDailyMetricsRow = null
}) {
  const target = decodeURIComponent(String(rawTarget || '').trim());
  if (!target) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot date or intraday checkpoint ID is required'
    };
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  const isIntradayTarget = target.startsWith('intra_') || target.startsWith('intraday_');
  if (isIntradayTarget) {
    if (sql) {
      try {
        await runInTx(async (tx) => {
          await tx`
            UPDATE universal_master_pins
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{intraday_snapshots}',
              COALESCE((
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
                ) AS elem
                WHERE COALESCE(elem->>'id', '') <> ${target}
              ), '[]'::jsonb)
            ),
            updated_at = NOW()
            WHERE pin_id = ${pinId};
          `;
          await recordDeletedSnapshotTombstone({ sql: tx, pinId, targetDate: target });
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        });
      } catch (err) {
        console.error(`[PinsRoute.deleteSnapshot] Intraday delete failed for pin ${pinId}:`, err?.message || err);
        if (throwOnError) throw err;
      }
    }
    return { ok: true, mode: 'intraday', deletedTarget: target, deletedDate: null };
  }

  const dateCandidate = /^\d{4}-\d{2}-\d{2}$/.test(target)
    ? target
    : (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate).trim()) ? String(fallbackDate).trim() : null);

  if (!dateCandidate) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot_date or intraday checkpoint ID is required'
    };
  }

  const parsedDate = new Date(`${dateCandidate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateCandidate) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Valid YYYY-MM-DD snapshot date is required'
    };
  }

  if (sql) {
    try {
      await runInTx(async (tx) => {
        const [umpRow] = await tx`
          SELECT metadata FROM universal_master_pins WHERE pin_id = ${pinId} LIMIT 1;
        `;
        const intraArr = Array.isArray(umpRow?.metadata?.intraday_snapshots)
          ? umpRow.metadata.intraday_snapshots.filter(x => x && String(x.snapshot_date || '').slice(0, 10) === dateCandidate)
          : [];

        if (intraArr.length > 0) {
          intraArr.sort((a, b) => String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')));
          const promoted = intraArr[0];
          const promotedId = String(promoted.id || '');
          const parseNullablePromoMetric = (val) => {
            if (val === null || val === undefined || val === '') return null;
            const n = Number(val);
            return Number.isFinite(n) ? Math.max(0, n) : null;
          };
          const promoSaves = parseNullablePromoMetric(promoted.save_count);
          const promoRepins = parseNullablePromoMetric(promoted.repin_count);
          const promoComments = parseNullablePromoMetric(promoted.comment_count);
          const promoShares = parseNullablePromoMetric(promoted.share_count);
          await tx`
            UPDATE pins_daily_metrics
            SET
              save_count = ${promoSaves},
              repin_count = ${promoRepins},
              comment_count = ${promoComments},
              share_count = ${promoShares},
              updated_at = COALESCE(NULLIF(${String(promoted.recorded_at || '')}, '')::timestamptz, NOW())
            WHERE pin_id = ${pinId} AND recorded_date = ${dateCandidate}::date;
          `;
          await tx`
            UPDATE universal_master_pins
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{intraday_snapshots}',
              COALESCE((
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(metadata->'intraday_snapshots') = 'array' THEN metadata->'intraday_snapshots' ELSE '[]'::jsonb END
                ) AS elem
                WHERE COALESCE(elem->>'id', '') <> ${promotedId}
              ), '[]'::jsonb)
            ),
            updated_at = NOW()
            WHERE pin_id = ${pinId};
          `;
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        } else {
          if (typeof deleteDailyMetricsRow === 'function') {
            await deleteDailyMetricsRow(tx);
          } else {
            await tx`
              DELETE FROM pins_daily_metrics
              WHERE pin_id = ${pinId} AND recorded_date = ${dateCandidate}::date;
            `;
          }
          await recordDeletedSnapshotTombstone({ sql: tx, pinId, targetDate: dateCandidate });
          await reconcilePinMetricsAfterSnapshotDelete({ sql: tx, pinId });
        }
      });
    } catch (err) {
      console.error(`[PinsRoute.deleteSnapshot] Daily delete failed for pin ${pinId}:`, err?.message || err);
      if (throwOnError) throw err;
    }
  }

  return { ok: true, mode: 'daily', deletedTarget: target, deletedDate: dateCandidate };
}
