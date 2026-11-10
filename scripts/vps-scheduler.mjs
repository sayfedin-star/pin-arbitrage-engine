#!/usr/bin/env node

/**
 * scripts/vps-scheduler.mjs
 *
 * [VPS Policy] Local VPS crawling is permanently disabled.
 * All crawls execute exclusively on the GitHub Actions 20-runner parallel fleet.
 */

export const VPS_JOBS = [];

console.log('[VPS Policy] Local VPS crawling is permanently disabled. All crawls execute exclusively on the GitHub Actions 20-runner parallel fleet.');
process.exit(0);
