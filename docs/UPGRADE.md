# dans-pants-tracker Upgrade: Airtable → Turso SQLite

**Phase 1** — Replace Airtable with Turso (edge-replicated SQLite), zero changes to the frontend.

---

## Why Turso

- **SQLite at the edge** — your data lives close to Netlify's runtime, fast reads everywhere
- **Zero ops** — Turso handles replication and durability, no server to manage
- **Generous free tier** — 9GB storage, 500 DBs, no credit card
- **Compatible** — `@libsql/client` works on Netlify Functions without native modules or rebuilding

The only difference from `better-sqlite3`: it's async instead of sync, and connects over HTTPS. The `lib/db.js` interface is the same — `getStatus()`, `updateStatus()`, `refreshStreak()` all work the same way.

---

## What Changes

### Removed
- `airtable` npm package
- `AIRTABLE_BASE_ID`, `AIRTABLE_RECORD_ID`, `AIRTABLE_ACCESS_TOKEN` env vars

### Added
- `@libsql/client` — async SQLite client for Turso
- `lib/db.js` — data access layer (getStatus, updateStatus, refreshStreak, getHistory, getStreaks)
- `lib/schema.sql` — database schema with status + history tables
- `TURSO_DATABASE_URL` env var — your Turso database URL
- `TURSO_AUTH_TOKEN` env var — your Turso auth token (from `turso db show`)

### Migrated
- `netlify/functions/getStatus.js` — Airtable fetch → `db.refreshStreak()`
- `netlify/functions/setStatus.js` — Airtable patch → `db.updateStatus()`

### Unchanged
- `index.html` — buttons, fetch calls, display logic — all identical
- `netlify.toml` — no longer needed (no native module to bundle)

---

## Schema

```sql
CREATE TABLE status (
    id               INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton: always id=1
    status           TEXT NOT NULL DEFAULT 'Pants'
                              CHECK (status IN ('Pants', 'Shorts')),
    last_status_date TEXT NOT NULL,
    consecutive_days INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL DEFAULT 'default',
    status     TEXT NOT NULL CHECK (status IN ('Pants', 'Shorts')),
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_history_user ON history(user_id);
CREATE INDEX idx_history_date ON history(changed_at);
```

**`status` table** — singleton row (id=1). Holds current state.

**`history` table** — append-only log. Every status change inserts a row. Enables streaks, heatmaps, leaderboards.

---

## File Map

```
dans-pants-tracker/
├── docs/
│   └── UPGRADE.md              ← this file
├── lib/
│   ├── db.js                   ← new: data access layer (Turso)
│   └── schema.sql              ← new: schema + seed
├── netlify/functions/
│   ├── getStatus.js            ← migrated: Airtable → Turso
│   └── setStatus.js            ← migrated: Airtable → Turso
├── package.json                ← removed airtable, added @libsql/client
├── netlify.toml                ← removed (was for better-sqlite3 bundling — no longer needed)
└── index.html                  ← unchanged
```

---

## Setup: Turso

### 1. Install the Turso CLI

```bash
curl -sSfL https://get.tur.so/r/install.sh | bash
# or: brew install tursodb/tap/turso
```

### 2. Create your database

```bash
turso auth login
turso db create dans-pants-tracker
turso db show dans-pants-tracker   # copy the URL below
```

### 3. Initialize the schema

```bash
turso db shell dans-pants-tracker < lib/schema.sql
```

### 4. Get your auth token

```bash
turso db tokens create dans-pants-tracker
```

---

## Local Dev

```bash
# Clone and install
git clone https://github.com/jbk708/dans-pants-tracker.git
cd dans-pants-tracker
git checkout sqlite-migration
npm install

# Set env vars — copy the URL and token from `turso db show`
export TURSO_DATABASE_URL="libsql://tracker-xxxx.dans-pants-tracker-xxxx.turso.io"
export TURSO_AUTH_TOKEN="eyJ..."

# Run
npm run dev
```

---

## Netlify Deploy

### Required env vars (Netlify → Site → Environment Variables)

| Key | Value |
|-----|-------|
| `TURSO_DATABASE_URL` | From `turso db show` (e.g. `libsql://tracker-xxxx.turso.io`) |
| `TURSO_AUTH_TOKEN` | From `turso db tokens create` |

### Optional: local SQLite fallback for dev

If you want to develop offline, set `TURSO_DATABASE_URL` to a local file:

```bash
export TURSO_DATABASE_URL="file:local/tracker.db"
# schema auto-initializes on first run
```

---

## Phase 2: History + Features

With the history table in place, these are small incremental steps:

| Feature | What |
|---------|------|
| **History API** | `GET /status/history` — returns last N rows from `history` table |
| **Heatmap** | Query `history` grouped by date, render a calendar grid |
| **Streak leaderboard** | Current streak, longest pants streak, longest shorts streak |
| **Multiple users** | Add `WHERE user_id = ?` to all queries, pass `?user=dan` in the request |
| **API key auth** | Check `x-api-key` header in `setStatus.js`, compare to env var |

---

## Rollback Plan

If something breaks in prod, revert to the main branch:

```bash
git checkout main -- netlify/functions/ package.json
```

Keep `lib/` around — it won't affect the Airtable build (it's not imported).

---

## Appendix: Turso vs Self-Hosted

| | **Turso (cloud)** | **SQLite on `/tmp`** |
|--|-------------------|----------------------|
| Persistence | ✅ Survives cold starts | ❌ Resets on every cold start |
| Read latency | ~20-50ms globally | Instant on warm, broken on cold |
| Free tier | 9GB storage, 500 DBs | Unlimited |
| Setup | `turso db create` + 2 env vars | Zero config |
| Local dev | Fall back to `file:local/tracker.db` | Works offline |

The `/tmp` approach silently loses data on cold starts and looks like it's working. Don't use it for anything that matters. Turso is free and handles this correctly.