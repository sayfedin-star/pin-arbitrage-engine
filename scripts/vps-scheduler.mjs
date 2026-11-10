#!/usr/bin/env node

/**
 * scripts/vps-scheduler.mjs
 *
 * Unified Staggered VPS Cron Daemon for Single-DB Architecture
 *
 * Replaces the 20-runner GitHub Actions matrix workflows when running on a dedicated VPS.
 * Enforces non-overlapping staggered execution windows and leverages the 18-hour Shared Pin
 * Freshness Gate on `universal_master_pins` so pins scraped during Keyword SERP sweeps are
 * never re-scraped during Creator Velocity sweeps.
 *
 * Staggered Schedule (UTC):
 * - 01:00 UTC: Keyword SERP & Velocity Sweep (`scripts/keyword-velocity-crawler.mjs` + `scripts/backfill_rolling_window_gains.mjs`)
 * - 05:00 UTC: Creator Velocity & Reach Sweep (`scripts/creator-velocity-crawler.mjs`)
 * - 09:00 & 17:00 UTC: Account Related Pins Discovery (`scripts/account-related-crawler.mjs`)
 * - 11:00 UTC: Unified DB Storage Compaction & Maintenance (`scripts/optimize_hub_storage.mjs`)
 *
 * Usage:
 * - `node scripts/vps-scheduler.mjs --status`  -> Print schedule & environment readiness
 * - `node scripts/vps-scheduler.mjs --once=keywords|creators|related|maintenance` -> Run specific job immediately
 * - `node scripts/vps-scheduler.mjs`           -> Start continuous UTC cron loop
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.join(ROOT_DIR, '.env'));
  } catch (_) {}
}

export const VPS_JOBS = [
  {
    id: 'keywords',
    name: 'Keyword SERP & 24h Velocity Sweep',
    hoursUtc: [1],
    minuteUtc: 0,
    steps: [
      {
        cmd: process.execPath,
        args: ['--use-system-ca', 'scripts/keyword-velocity-crawler.mjs'],
        env: { WORKER_INDEX: '0', WORKER_TOTAL: '1', MODE: 'keyword_sweep' }
      },
      {
        cmd: process.execPath,
        args: ['scripts/backfill_rolling_window_gains.mjs'],
        env: {}
      },
      {
        cmd: process.execPath,
        args: ['scripts/keyword-fleet-consolidator.mjs'],
        env: { MODE: 'keyword_sweep' }
      },
      {
        cmd: process.execPath,
        args: ['scripts/refresh-domain-rollup.mjs'],
        env: {}
      }
    ]
  },
  {
    id: 'creators',
    name: 'Creator Reach & Velocity Sweep (18h Freshness Gate Active)',
    hoursUtc: [5],
    minuteUtc: 0,
    steps: [
      {
        cmd: process.execPath,
        args: ['--use-system-ca', 'scripts/creator-velocity-crawler.mjs'],
        env: { WORKER_INDEX: '0', WORKER_TOTAL: '1', MODE: 'creator_sweep' }
      },
      {
        cmd: process.execPath,
        args: ['scripts/creator-fleet-consolidator.mjs'],
        env: { MODE: 'creator_sweep' }
      },
      {
        cmd: process.execPath,
        args: ['scripts/refresh-domain-rollup.mjs'],
        env: {}
      }
    ]
  },
  {
    id: 'related',
    name: 'Account Related Pins Graph Discovery',
    hoursUtc: [9, 17],
    minuteUtc: 0,
    requiresTargetAccount: true,
    steps: [
      {
        cmd: process.execPath,
        args: ['--use-system-ca', 'scripts/account-related-crawler.mjs'],
        env: {}
      }
    ]
  },
  {
    id: 'maintenance',
    name: 'Unified DB Storage Compaction & Rolling Gains Sync',
    hoursUtc: [11],
    minuteUtc: 0,
    steps: [
      {
        cmd: process.execPath,
        args: ['scripts/optimize_hub_storage.mjs'],
        env: {}
      }
    ]
  }
];

function runStep(step) {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_TOPOLOGY: 'unified_postgres',
        SINGLE_DB_MODE: 'true',
        ...step.env
      }
    });
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', (err) => {
      console.error(`[VPS-Scheduler] Step spawn error:`, err.message);
      resolve(false);
    });
  });
}

let activeJobId = null;
const completedWindowKeys = new Set();

export async function executeVpsJob(jobId) {
  const job = VPS_JOBS.find((j) => j.id === jobId);
  if (!job) {
    console.error(`[VPS-Scheduler] Unknown job id: "${jobId}". Valid IDs: ${VPS_JOBS.map(j => j.id).join(', ')}`);
    return false;
  }
  if (job.requiresTargetAccount && !String(process.env.TARGET_ACCOUNT || '').trim()) {
    console.log(`[VPS-Scheduler] Skipping "${job.id}" because TARGET_ACCOUNT is not set.`);
    return true;
  }
  if (activeJobId) {
    console.warn(`[VPS-Scheduler] Skipping "${job.id}" because "${activeJobId}" is currently in-flight.`);
    return false;
  }

  activeJobId = job.id;
  const startMs = Date.now();
  console.log(`\n================================================================================`);
  console.log(`🚀 [VPS-Scheduler] Starting Job "${job.name}" (${job.id}) at ${new Date().toISOString()}`);
  console.log(`================================================================================`);

  let allSucceeded = true;
  try {
    for (const step of job.steps) {
      console.log(`[*] Executing: ${path.basename(step.cmd)} ${step.args.join(' ')}`);
      const ok = await runStep(step);
      if (!ok) {
        allSucceeded = false;
        console.warn(`[!] Step exited with non-zero status: ${step.args.join(' ')}`);
      }
    }
  } finally {
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`✅ [VPS-Scheduler] Finished Job "${job.id}" in ${elapsedSec}s (Success: ${allSucceeded})`);
    activeJobId = null;
  }
  return allSucceeded;
}

function printScheduleStatus() {
  console.log('================================================================================');
  console.log('   PAE UNIFIED SINGLE-DB VPS CRON SCHEDULER');
  console.log('================================================================================');
  console.log(`Current UTC Time : ${new Date().toISOString()}`);
  console.log(`Database Topology: unified_postgres (1 Unified PostgreSQL Database, 0 External Shards)`);
  console.log(`Internal Daemon  : ${process.env.ENABLE_INTERNAL_CRON === 'true' ? 'ENABLED' : 'DORMANT (Delegated to GitHub Actions 20-Runner Fleet)'}`);
  console.log(`Freshness Gate   : 18 Hours Shared Pin Deduplication via universal_master_pins`);
  console.log('--------------------------------------------------------------------------------');
  for (const job of VPS_JOBS) {
    const times = job.hoursUtc.map(h => `${String(h).padStart(2, '0')}:${String(job.minuteUtc).padStart(2, '0')} UTC`).join(', ');
    console.log(`- [${job.id.padEnd(11)}] ${times.padEnd(22)} -> ${job.name}`);
  }
  console.log('================================================================================');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    printScheduleStatus();
    process.exit(0);
  }

  const onceArg = args.find(a => a.startsWith('--once='));
  if (onceArg) {
    const jobId = onceArg.split('=')[1]?.trim();
    const ok = await executeVpsJob(jobId);
    process.exit(ok ? 0 : 1);
  }

  printScheduleStatus();
  if (process.env.ENABLE_INTERNAL_CRON !== 'true' && !args.includes('--daemon')) {
    console.log('[*] Internal cron loop is dormant by default so GitHub Actions 20-runner workflows');
    console.log('    (01:00 UTC Keywords, 02:00 UTC Creators, 04:00 UTC Clusters) run without collision');
    console.log('    and InstaBox VM can enter 30-min idle sleep cleanly.');
    console.log('    Pass --once=<job> for immediate execution or set ENABLE_INTERNAL_CRON=true to keep daemon active.');
    process.exit(0);
  }

  console.log('[*] Entering continuous UTC cron loop (checking every 30 seconds)...');

  setInterval(async () => {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    for (const job of VPS_JOBS) {
      if (job.hoursUtc.includes(hour) && minute >= job.minuteUtc && minute < job.minuteUtc + 5) {
        const windowKey = `${dateKey}:${hour}:${job.id}`;
        if (!completedWindowKeys.has(windowKey)) {
          completedWindowKeys.add(windowKey);
          await executeVpsJob(job.id);
        }
      }
    }
  }, 30_000);
}

const isMainModule = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
);

if (isMainModule) {
  main().catch((err) => {
    console.error('[VPS-Scheduler] Fatal error:', err);
    process.exit(1);
  });
}
