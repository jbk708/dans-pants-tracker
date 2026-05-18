/**
 * lib/db.js — Turso via HTTP REST API
 * No native add-ons needed; works on any Node.js environment including Netlify.
 *
 * Turso REST API: POST https://{db}.turso.io/v2/pipeline
 * Auth: Bearer {TURSO_AUTH_TOKEN}
 */

const DB_URL    = process.env.TURSO_DATABASE_URL;
const DB_TOKEN  = process.env.TURSO_AUTH_TOKEN;
const API_ROOT  = `${DB_URL}/v2/pipeline`;

// ─── Low-level HTTP ─────────────────────────────────────────────────────────

async function turso(req) {
    const res = await fetch(API_ROOT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DB_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Turso ${res.status}: ${text}`);
    }

    return res.json();
}

/**
 * Run a single SQL statement.
 * @param {string} sql
 * @param {any[]} [args]
 */
async function sql(sql, args = []) {
    const result = await turso({ requests: [{ type: 'execute', stmt: { sql, args } }] });
    const r = result.results[0];
    if (r.error) throw new Error(r.error.message);
    return r;
}

/**
 * Run a sequence of SQL statements.
 * @param {Array<{sql: string, args?: any[]}>} stmts
 */
async function sqlBatch(stmts) {
    const requests = stmts.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: s.args || [] } }));
    const result = await turso({ requests });
    for (const r of result.results) {
        if (r.error) throw new Error(r.error.message);
    }
    return result;
}

// ─── Schema init ────────────────────────────────────────────────────────────

let _initialized = false;

async function initSchema() {
    if (_initialized) return;

    await sqlBatch([
        { sql: 'CREATE TABLE IF NOT EXISTS status (id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL DEFAULT \'Pants\' CHECK (status IN (\'Pants\', \'Shorts\')), last_status_date TEXT NOT NULL, consecutive_days INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))' },
        { sql: 'CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT \'default\', status TEXT NOT NULL CHECK (status IN (\'Pants\', \'Shorts\')), changed_at TEXT NOT NULL DEFAULT (datetime(\'now\')))' },
        { sql: 'CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id)' },
        { sql: 'CREATE INDEX IF NOT EXISTS idx_history_date ON history(changed_at)' },
        { sql: 'INSERT OR IGNORE INTO status (id, status, last_status_date, consecutive_days) VALUES (1, \'Pants\', date(\'now\'), 0)' },
    ]);

    _initialized = true;
}

function validateStatus(status) {
    if (status !== 'Pants' && status !== 'Shorts') {
        throw new Error(`Invalid status: ${status}. Must be Pants or Shorts.`);
    }
}

// ─── Pacific timezone ───────────────────────────────────────────────────────

/**
 * Returns today's date in America/Los_Angeles (Pacific).
 * @returns {string} YYYY-MM-DD
 */
function pacificDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

// ─── Status queries ─────────────────────────────────────────────────────────

async function getStatus() {
    await initSchema();
    const rows = (await sql('SELECT * FROM status WHERE id = 1')).rows || [];
    const row = rows[0];
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
 * Check if an entry already exists in history for today (Pacific).
 * @param {string} [userId='default']
 * @returns {Promise<boolean>}
 */
async function hasEntryToday(userId = 'default') {
    await initSchema();
    const r = await sql(
        'SELECT 1 FROM history WHERE user_id = ? AND changed_at = ?',
        [userId, pacificDate()],
    );
    return (r.rows || []).length > 0;
}

/**
 * Update status and log to history. One entry per user per Pacific day.
 * @param {'Pants'|'Shorts'} status
 * @param {string} [userId='default']
 * @returns {{ message: string }}
 */
async function updateStatus(status, userId = 'default') {
    validateStatus(status);
    await initSchema();

    const today = pacificDate();
    const existing = await hasEntryToday(userId);
    if (existing) {
        throw new Error(`Already an entry for today (${today}). One update per day.`);
    }

    const current = await getStatus();
    let newDays;
    if (current.status === status) {
        const diff = Math.floor((new Date(today) - new Date(current.last_status_date)) / 86400000);
        newDays = current.consecutive_days + Math.max(1, diff);
    } else {
        newDays = 1;
    }

    await sqlBatch([
        { sql: "UPDATE status SET status = ?, last_status_date = ?, consecutive_days = ?, updated_at = datetime('now') WHERE id = 1", args: [status, today, newDays] },
        { sql: 'INSERT INTO history (user_id, status, changed_at) VALUES (?, ?, ?)', args: [userId, status, today] },
    ]);

    return { message: `Status updated to: ${status}` };
}

/**
 * On GET: handle day-rollover, bump streak silently.
 * @returns {{ status: string, consecutiveDays: number }}
 */
async function refreshStreak() {
    await initSchema();
    const today = pacificDate();
    const current = await getStatus();

    if (current.last_status_date === today) {
        return { status: current.status, consecutiveDays: current.consecutive_days };
    }

    const diff = Math.floor((new Date(today) - new Date(current.last_status_date)) / 86400000);
    if (diff > 0) {
        await sql("UPDATE status SET last_status_date = ?, consecutive_days = consecutive_days + ?, updated_at = datetime('now') WHERE id = 1", [today, diff]);
    }

    const updated = await getStatus();
    return { status: updated.status, consecutiveDays: updated.consecutive_days };
}

// ─── History ────────────────────────────────────────────────────────────────

/**
 * @param {{ limit?: number, userId?: string }} [opts]
 * @returns {Promise<Array>}
 */
async function getHistory({ limit = 30, userId = 'default' } = {}) {
    await initSchema();
    const r = await sql(
        'SELECT id, user_id, status, changed_at FROM history WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?',
        [userId, limit],
    );
    return r.rows || [];
}

/**
 * @param {string} [userId='default']
 * @returns {{ currentStreak: number, longestPants: number, longestShorts: number }}
 */
async function getStreaks(userId = 'default') {
    await initSchema();
    const current = await getStatus();
    const r = await sql(
        'SELECT status, changed_at FROM history WHERE user_id = ? ORDER BY changed_at ASC',
        [userId],
    );
    let longestPants = 0, longestShorts = 0, pantsS = 0, shortsS = 0;
    for (const row of r.rows || []) {
        if (row.status === 'Pants') { pantsS++; shortsS = 0; }
        else { shortsS++; pantsS = 0; }
        longestPants  = Math.max(longestPants,  pantsS);
        longestShorts = Math.max(longestShorts, shortsS);
    }
    return { currentStreak: current.consecutive_days, longestPants, longestShorts };
}

module.exports = { getStatus, updateStatus, refreshStreak, getHistory, getStreaks, validateStatus };