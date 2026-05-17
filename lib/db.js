const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Determine DB path from DATABASE_URL env var, or fall back to data/tracker.db
function getDbPath() {
    const url = process.env.DATABASE_URL;
    if (url) return url;
    return path.join(process.cwd(), 'data', 'tracker.db');
}

// Singleton DB instance — reused across warm function invocations
let _db = null;

function getDb() {
    if (_db) return _db;

    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);

    // Ensure the data directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    // Auto-init schema if tables don't exist
    initSchema(_db);

    return _db;
}

function initSchema(db) {
    // Run schema SQL — CREATE TABLE IF NOT EXISTS makes this idempotent
    db.exec(schema);
}

function validateStatus(status) {
    if (status !== 'Pants' && status !== 'Shorts') {
        throw new Error(`Invalid status: ${status}. Must be Pants or Shorts.`);
    }
}

// ─── Status queries ─────────────────────────────────────────────────────────

function getStatus() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM status WHERE id = 1').get();
    if (!row) throw new Error('Status row not found');
    return row;
}

/**
 * Update the current status and recalculate consecutive days.
 * Also appends a row to the history table.
 *
 * @param {string} status - 'Pants' or 'Shorts'
 * @returns {{ message: string }}
 */
function updateStatus(status) {
    validateStatus(status);

    const db = getDb();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    db.transaction(() => {
        const current = db.prepare('SELECT * FROM status WHERE id = 1').get();
        const lastDate = current.last_status_date;

        // Determine consecutive days
        let newConsecutiveDays;
        if (current.status === status) {
            // Same status — count days since last update
            const diffMs = new Date(today).getTime() - new Date(lastDate).getTime();
            const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            newConsecutiveDays = current.consecutive_days + Math.max(1, daysDiff);
        } else {
            // New status — streak resets to 1
            newConsecutiveDays = 1;
        }

        // Update status row
        db.prepare(`
            UPDATE status
            SET    status           = ?,
                   last_status_date = ?,
                   consecutive_days = ?,
                   updated_at       = datetime('now')
            WHERE  id = 1
        `).run(status, today, newConsecutiveDays);

        // Log to history
        db.prepare(`
            INSERT INTO history (user_id, status, changed_at)
            VALUES ('default', ?, ?)
        `).run(status, today);
    })();

    return { message: `Status updated to: ${status}` };
}

/**
 * Called on GET to handle day-rollover.
 * If the last_status_date is in the past, bumps consecutive_days
 * so the streak stays accurate even if no one clicked a button today.
 *
 * @returns {{ status: string, consecutiveDays: number }}
 */
function refreshStreak() {
    const db = getDb();
    const current = getStatus();
    const today = new Date().toISOString().split('T')[0];

    const lastDate = current.last_status_date;
    if (lastDate === today) {
        // Already up to date
        return {
            status: current.status,
            consecutiveDays: current.consecutive_days,
        };
    }

    // It's a new day — bump the streak silently
    const diffMs = new Date(today).getTime() - new Date(lastDate).getTime();
    const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysDiff > 0) {
        db.prepare(`
            UPDATE status
            SET    last_status_date = ?,
                   consecutive_days = consecutive_days + ?,
                   updated_at       = datetime('now')
            WHERE  id = 1
        `).run(today, daysDiff);
    }

    const updated = getStatus();
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
function getHistory({ limit = 30, userId = 'default' } = {}) {
    const db = getDb();
    return db.prepare(`
        SELECT id, user_id, status, changed_at
        FROM   history
        WHERE  user_id = ?
        ORDER BY changed_at DESC
        LIMIT  ?
    `).all(userId, limit);
}

/**
 * Get streak statistics for a user.
 *
 * @param {string} [userId='default']
 * @returns {{ currentStreak: number, longestPants: number, longestShorts: number }}
 */
function getStreaks(userId = 'default') {
    const db = getDb();

    const current = db.prepare(`
        SELECT status, consecutive_days
        FROM   status
        WHERE  user_id = ?
    `).get(userId);

    if (!current) {
        return { currentStreak: 0, longestPants: 0, longestShorts: 0 };
    }

    // Longest pants/shorts streak from history
    const history = db.prepare(`
        SELECT status, changed_at
        FROM   history
        WHERE  user_id = ?
        ORDER BY changed_at ASC
    `).all(userId);

    let longestPants = 0;
    let longestShorts = 0;
    let pantsStreak = 0;
    let shortsStreak = 0;

    for (const row of history) {
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
    getDb,
    getStatus,
    updateStatus,
    refreshStreak,
    getHistory,
    getStreaks,
    validateStatus,
};