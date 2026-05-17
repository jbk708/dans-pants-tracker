-- dans-pants-tracker schema
-- Auto-initialized by lib/db.js on first run

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS status (
    id               INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton: always id=1
    status           TEXT NOT NULL DEFAULT 'Pants'
                              CHECK (status IN ('Pants', 'Shorts')),
    last_status_date TEXT NOT NULL,
    consecutive_days INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL DEFAULT 'default',
    status     TEXT NOT NULL CHECK (status IN ('Pants', 'Shorts')),
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON history(changed_at);

-- Seed the singleton status row if it doesn't exist
INSERT OR IGNORE INTO status (id, status, last_status_date, consecutive_days)
VALUES (1, 'Pants', date('now'), 0);