const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Determine DB URL: local SQLite file, Turso, or libsql://
function getDbUrl() {
    // 1. Explicit local path (e.g. /workspace/dans-pants-tracker/data/tracker.db)
    if (process.env.LOCAL_DB_PATH) {
        return `file:${process.env.LOCAL_DB_PATH}`;
    }

    // 2. Turso / any libsql:// URL
    if (process.env.TURSO_DATABASE_URL) {
        return process.env.TURSO_DATABASE_URL;
    }

    // 3. Fallback: local file in project data/ directory
    //    The calling process should create this directory before first use.
    const dataDir = path.join(__dirname, '..', 'data');
    return `file:${dataDir}/tracker.db`;
}

// Singleton DB client — reused across warm function invocations
let _client = null;
let _initialized = false;

function getClient() {
    if (_client) return _client;

    _client = createClient({
        url: getDbUrl(),
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    return _client;
}

// ─── Schema init ────────────────────────────────────────────────────────────

async function initSchema() {
    if (_initialized) return;

    const client = getClient();
    // Run schema SQL — CREATE TABLE IF NOT EXISTS makes this idempotent
    await client.executeMultiple(schema);
    _initialized = true;
}

function validateStatus(status) {
    if (status !== 'Pants' && status !== 'Shorts') {
        throw new Error(`Invalid status: ${status}. Must be Pants or Shorts.`);
    }
}

// ─── Status queries ─────────────────────────────────────────────────────────

async function getStatus() {
    await initSchema();
    const client = getClient();
    const result = await client.execute('SELECT * FROM status WHERE id = 1');
    const row = result.rows[0];
    if (!row) throw new Error('Status row not found');

    // Turso returns row keys with lowercase names — normalize
    return {
        id: row.id,
        status: row.status,
        last_status_date: row.last_status_date,
        consecutive_days: row.consecutive_days,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

/**
 * Update the current status and recalculate consecutive days.
 * Also appends a row to the history table.
 *
 * @param {string} status - 'Pants' or 'Shorts'
 * @param {string} [userId='default'] - User identifier
 * @returns {{ message: string }}
 */
async function updateStatus(status, userId = 'default') {
    validateStatus(status);
    await initSchema();

    const client = getClient();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch current state
    const current = await getStatus();

    // Determine consecutive days
    let newConsecutiveDays;
    if (current.status === status) {
        const diffMs = new Date(today).getTime() - new Date(current.last_status_date).getTime();
        const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        newConsecutiveDays = current.consecutive_days + Math.max(1, daysDiff);
    } else {
        newConsecutiveDays = 1;
    }

    // Update status row and log to history — wrapped in a transaction
    await client.executeMultiple(`
        UPDATE status
        SET    status           = '${status}',
               last_status_date = '${today}',
               consecutive_days = ${newConsecutiveDays},
               updated_at       = datetime('now')
        WHERE  id = 1;

        INSERT INTO history (user_id, status, changed_at)
        VALUES ('${userId}', '${status}', '${today}');
    `);

    return { message: `Status updated to: ${status}` };
}

/**
 * Called on GET to handle day-rollover.
 * Bumps consecutive_days if the last_status_date is in the past,
 * so the streak stays accurate even if no one clicked today.
 *
 * @returns {{ status: string, consecutiveDays: number }}
 */
async function refreshStreak() {
    await initSchema();
    const client = getClient();
    const today = new Date().toISOString().split('T')[0];

    const current = await getStatus();

    if (current.last_status_date === today) {
        return {
            status: current.status,
            consecutiveDays: current.consecutive_days,
        };
    }

    // It's a new day — bump the streak silently
    const diffMs = new Date(today).getTime() - new Date(current.last_status_date).getTime();
    const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysDiff > 0) {
        await client.execute({
            sql: `UPDATE status
                  SET    last_status_date = ?,
                         consecutive_days = consecutive_days + ?,
                         updated_at       = datetime('now')
                  WHERE  id = 1`,
            args: [today, daysDiff],
        });
    }

    const updated = await getStatus();
    return {
        status: updated.status,
        consecutiveDays: updated.consecutive_days,
    };
}

// ─── History queries ────────────────────────────────────────────────────────

/**
 * Get the status change log.
 *
 * @param {object} opts
 * @param {number} [opts.limit=30]  Max rows to return
 * @param {string} [opts.userId]    Filter by user (default: 'default')
 * @returns {Array<object>}
 */
async function getHistory({ limit = 30, userId = 'default' } = {}) {
    await initSchema();
    const client = getClient();
    const result = await client.execute({
        sql: `SELECT id, user_id, status, changed_at
              FROM   history
              WHERE  user_id = ?
              ORDER BY changed_at DESC
              LIMIT  ?`,
        args: [userId, limit],
    });
    return result.rows;
}

/**
 * Get streak statistics for a user.
 *
 * @param {string} [userId='default']
 * @returns {{ currentStreak: number, longestPants: number, longestShorts: number }}
 */
async function getStreaks(userId = 'default') {
    await initSchema();
    const client = getClient();

    const current = await getStatus();

    // Longest pants/shorts streak from history
    const result = await client.execute({
        sql: `SELECT status, changed_at
              FROM   history
              WHERE  user_id = ?
              ORDER BY changed_at ASC`,
        args: [userId],
    });

    let longestPants = 0;
    let longestShorts = 0;
    let pantsStreak = 0;
    let shortsStreak = 0;

    for (const row of result.rows) {
        if (row.status === 'Pants') {
            pantsStreak++;
            shortsStreak = 0;
        } else {
            shortsStreak++;
            pantsStreak = 0;
        }
        longestPants = Math.max(longestPants, pantsStreak);
        longestShorts = Math.max(longestShorts, shortsStreak);
    }

    return {
        currentStreak: current.consecutive_days,
        longestPants,
        longestShorts,
    };
}

module.exports = {
    getClient,
    getStatus,
    updateStatus,
    refreshStreak,
    getHistory,
    getStreaks,
    validateStatus,
};