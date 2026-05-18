const { createClient } = require('@libsql/client');

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
    const path = require('path');
    return `file:${path.join(__dirname, '..', 'data')}/tracker.db`;
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
    const stmts = [
        'PRAGMA journal_mode = WAL',
        'PRAGMA foreign_keys = ON',
        `CREATE TABLE IF NOT EXISTS status (
            id               INTEGER PRIMARY KEY CHECK (id = 1),
            status           TEXT NOT NULL DEFAULT 'Pants'
                              CHECK (status IN ('Pants', 'Shorts')),
            last_status_date TEXT NOT NULL,
            consecutive_days INTEGER NOT NULL DEFAULT 0,
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    TEXT NOT NULL DEFAULT 'default',
            status     TEXT NOT NULL CHECK (status IN ('Pants', 'Shorts')),
            changed_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        'CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_history_date ON history(changed_at)',
        `INSERT OR IGNORE INTO status (id, status, last_status_date, consecutive_days)
         VALUES (1, 'Pants', date('now'), 0)`,
    ];

    for (const sql of stmts) {
        await client.execute(sql);
    }

    _initialized = true;
}

function validateStatus(status) {
    if (status !== 'Pants' && status !== 'Shorts') {
        throw new Error(`Invalid status: ${status}. Must be Pants or Shorts.`);
    }
}

// ─── Pacific timezone helpers ───────────────────────────────────────────────

/**
 * Returns today's date string in America/Los_Angeles (Pacific) timezone.
 * @returns {string} YYYY-MM-DD
 */
function getPacificDate() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
}

// ─── Status queries ─────────────────────────────────────────────────────────

async function getStatus() {
    await initSchema();
    const client = getClient();
    const result = await client.execute('SELECT * FROM status WHERE id = 1');
    const row = result.rows[0];
    if (!row) throw new Error('Status row not found');

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
 * Check if an entry already exists in history for today (Pacific time).
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasEntryToday(userId = 'default') {
    const client = getClient();
    const pacificToday = getPacificDate();
    const result = await client.execute({
        sql: `SELECT 1 FROM history
              WHERE  user_id = ?
              AND    changed_at = ?`,
        args: [userId, pacificToday],
    });
    return result.rows.length > 0;
}

/**
 * Update the current status and recalculate consecutive days.
 * Also appends a row to the history table.
 * Limited to one entry per user per Pacific day.
 *
 * @param {string} status - 'Pants' or 'Shorts'
 * @param {string} [userId='default'] - User identifier
 * @returns {{ message: string }}
 */
async function updateStatus(status, userId = 'default') {
    validateStatus(status);
    await initSchema();

    const client = getClient();
    const pacificToday = getPacificDate();

    // Reject if already an entry today (one per Pacific day)
    const existing = await hasEntryToday(userId);
    if (existing) {
        throw new Error(`Already an entry for today (${pacificToday}). One update per day.`);
    }

    // Fetch current state
    const current = await getStatus();

    // Determine consecutive days
    let newConsecutiveDays;
    if (current.status === status) {
        const diffMs = new Date(pacificToday).getTime() - new Date(current.last_status_date).getTime();
        const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        newConsecutiveDays = current.consecutive_days + Math.max(1, daysDiff);
    } else {
        newConsecutiveDays = 1;
    }

    // Update status row
    await client.execute({
        sql: `UPDATE status
              SET    status           = ?,
                     last_status_date = ?,
                     consecutive_days = ?,
                     updated_at       = datetime('now')
              WHERE  id = 1`,
        args: [status, pacificToday, newConsecutiveDays],
    });

    // Log to history
    await client.execute({
        sql: `INSERT INTO history (user_id, status, changed_at)
              VALUES (?, ?, ?)`,
        args: [userId, status, pacificToday],
    });

    return { message: `Status updated to: ${status}` };
}

/**
 * Called on GET to handle day-rollover.
 * Bumps consecutive_days if the last_status_date is in the past.
 * @returns {{ status: string, consecutiveDays: number }}
 */
async function refreshStreak() {
    await initSchema();
    const client = getClient();
    const pacificToday = getPacificDate();

    const current = await getStatus();

    if (current.last_status_date === pacificToday) {
        return {
            status: current.status,
            consecutiveDays: current.consecutive_days,
        };
    }

    const diffMs = new Date(pacificToday).getTime() - new Date(current.last_status_date).getTime();
    const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysDiff > 0) {
        await client.execute({
            sql: `UPDATE status
                  SET    last_status_date = ?,
                         consecutive_days = consecutive_days + ?,
                         updated_at       = datetime('now')
                  WHERE  id = 1`,
            args: [pacificToday, daysDiff],
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
 * @param {{ limit?: number, userId?: string }} [opts]
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
 * @param {string} [userId='default']
 * @returns {{ currentStreak: number, longestPants: number, longestShorts: number }}
 */
async function getStreaks(userId = 'default') {
    await initSchema();
    const client = getClient();
    const current = await getStatus();

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