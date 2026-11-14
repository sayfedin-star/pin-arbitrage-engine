#!/usr/bin/env node

/**
 * scripts/patch-postgres.mjs
 *
 * Fail-loud, idempotent postinstall patcher for postgres@3.4.9:
 * 1. Guards connection.js nextWrite() against null/destroyed sockets so race-condition
 *    writes after socket close reject queries cleanly instead of throwing uncaught TypeErrors.
 * 2. Guards connection.js closed(hadError) against null sockets and clears stale chunk/timer refs.
 * 3. Wraps transaction scope() rollback in index.js with try/catch so rollback on a closed
 *    socket never masks the original root-cause error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const NEXT_WRITE_MARKER = '// [pae-postgres-patch:nextWrite-null-socket]';
const CLOSED_MARKER = '// [pae-postgres-patch:closed-null-socket]';
const ROLLBACK_MARKER = '// [pae-postgres-patch:rollback-catch]';

const TARGET_NEXT_WRITE = `  function nextWrite(fn) {
    const x = socket.write(chunk, fn)
    nextWriteTimer !== null && clearImmediate(nextWriteTimer)
    chunk = nextWriteTimer = null
    return x
  }`;

const PATCHED_NEXT_WRITE = `  function nextWrite(fn) {
    ${NEXT_WRITE_MARKER}
    if (!socket || socket.destroyed) {
      nextWriteTimer !== null && clearImmediate(nextWriteTimer)
      chunk = nextWriteTimer = null
      const closedErr = Errors.connection('CONNECTION_CLOSED', options, socket)
      if (typeof fn === 'function') fn(closedErr)
      error(closedErr)
      return false
    }
    const x = socket.write(chunk, fn)
    nextWriteTimer !== null && clearImmediate(nextWriteTimer)
    chunk = nextWriteTimer = null
    return x
  }`;

const TARGET_CLOSED = `  async function closed(hadError) {
    incoming = Buffer.alloc(0)
    remaining = 0
    incomings = null
    clearImmediate(nextWriteTimer)
    socket.removeListener('data', data)
    socket.removeListener('connect', connected)
    idleTimer.cancel()
    lifeTimer.cancel()
    connectTimer.cancel()

    socket.removeAllListeners()
    socket = null`;

const PATCHED_CLOSED = `  async function closed(hadError) {
    ${CLOSED_MARKER}
    incoming = Buffer.alloc(0)
    remaining = 0
    incomings = null
    nextWriteTimer !== null && clearImmediate(nextWriteTimer)
    chunk = nextWriteTimer = null
    if (socket) {
      socket.removeListener('data', data)
      socket.removeListener('connect', connected)
    }
    idleTimer.cancel()
    lifeTimer.cancel()
    connectTimer.cancel()

    if (socket) {
      socket.removeAllListeners()
      socket = null
    }`;

const TARGET_ROLLBACK = `      } catch (e) {
        await (name
          ? sql\`rollback to \${ sql(name) }\`
          : sql\`rollback\`
        )
        throw e instanceof PostgresError && e.code === '25P02' && uncaughtError || e
      }`;

const PATCHED_ROLLBACK = `      } catch (e) {
        ${ROLLBACK_MARKER}
        try {
          await (name
            ? sql\`rollback to \${ sql(name) }\`
            : sql\`rollback\`
          )
        } catch (_) {}
        throw e instanceof PostgresError && e.code === '25P02' && uncaughtError || e
      }`;

function normalizeLf(str) {
  return String(str || '').replace(/\r\n/g, '\n');
}

function applySurgicalPatch(source, target, replacement, marker, label) {
  const normalized = normalizeLf(source);
  if (normalized.includes(marker)) {
    return { content: normalized, status: 'already_patched' };
  }
  if (!normalized.includes(target)) {
    throw new Error(`[patch-postgres] FAIL-LOUD: Expected snippet not found for "${label}". Check postgres package version.`);
  }
  const updated = normalized.replace(target, () => replacement);
  if (!updated.includes(marker)) {
    throw new Error(`[patch-postgres] FAIL-LOUD: Replacement verification failed for "${label}".`);
  }
  return { content: updated, status: 'patched' };
}

export function patchPostgresFiles(rootDir = process.cwd()) {
  const postgresSrcDir = path.join(rootDir, 'node_modules', 'postgres', 'src');
  const connectionPath = path.join(postgresSrcDir, 'connection.js');
  const indexPath = path.join(postgresSrcDir, 'index.js');

  if (!fs.existsSync(connectionPath) || !fs.existsSync(indexPath)) {
    throw new Error(`[patch-postgres] FAIL-LOUD: postgres source files not found at ${postgresSrcDir}`);
  }

  let connectionSrc = fs.readFileSync(connectionPath, 'utf8');
  const resNextWrite = applySurgicalPatch(
    connectionSrc,
    TARGET_NEXT_WRITE,
    PATCHED_NEXT_WRITE,
    NEXT_WRITE_MARKER,
    'connection.js:nextWrite'
  );
  connectionSrc = resNextWrite.content;

  const resClosed = applySurgicalPatch(
    connectionSrc,
    TARGET_CLOSED,
    PATCHED_CLOSED,
    CLOSED_MARKER,
    'connection.js:closed'
  );
  connectionSrc = resClosed.content;

  if (resNextWrite.status === 'patched' || resClosed.status === 'patched') {
    fs.writeFileSync(connectionPath, connectionSrc, 'utf8');
  }

  const indexSrc = fs.readFileSync(indexPath, 'utf8');
  const resRollback = applySurgicalPatch(
    indexSrc,
    TARGET_ROLLBACK,
    PATCHED_ROLLBACK,
    ROLLBACK_MARKER,
    'index.js:rollback'
  );

  if (resRollback.status === 'patched') {
    fs.writeFileSync(indexPath, resRollback.content, 'utf8');
  }

  return {
    nextWrite: resNextWrite.status,
    closed: resClosed.status,
    rollback: resRollback.status
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const result = patchPostgresFiles(process.cwd());
    console.log(
      `[patch-postgres] postgres@3.4.9 verified (nextWrite=${result.nextWrite}, closed=${result.closed}, rollback=${result.rollback})`
    );
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }
}
