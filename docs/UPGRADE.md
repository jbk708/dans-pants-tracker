# dans-pants-tracker Upgrade: Airtable → SQLite

**Phase 1** — Replace Airtable with a local SQLite database, zero changes to the frontend.

---

## Why

- Airtable is a spreadsheet posing as a database. It has rate limits, pricing, and a flat record model.
- SQLite is fast, local, zero-ops, and fits entirely in your repo.
- The history table unlocks streaks, heatmaps, and leaderboards without any schema changes.
- You stay on Netlify with the same function structure.

---

## What Changes

### Removed
- `airtable` npm package
- `AIRTABLE_BASE_ID`, `AIRTABLE_RECORD_ID`, `AIRTABLE_ACCESS_TOKEN` env vars
- `node-fetch` (no longer needed for Airtable proxy)

### Added
- `better-sqlite3` — synchronous SQLite, perfect for Netlify Functions (cold start → query → response)
- `lib/db.js` — data access layer (getStatus, updateStatus, refreshStreak, getHistory, getStreaks)
- `lib/schema.sql` — database schema with status + history tables
- `data/tracker.db` — SQLite database file (gitignored)
- `DATABASE_URL` env var — path to the DB file

### Migrated
- `netlify/functions/getStatus.js` — Airtable fetch → `db.refreshStreak()`
- `netlify/functions/setStatus.js` — Airtable patch → `db.updateStatus()`

### Unchanged
- `index.html` — buttons, fetch calls, display logic — all identical

---

## Schema

```sql
CREATE TABLE status (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
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
│   ├── db.js                   ← new: data access layer
│   └── schema.sql              ← new: schema + seed
├── netlify/functions/
│   ├── getStatus.js            ← migrated: Airtable → SQLite
│   └── setStatus.js            ← migrated: Airtable → SQLite
├── data/
│   └── tracker.db              ← gitignored: SQLite DB file
├── package.json                ← removed airtable, added better-sqlite3
├── netlify.toml                ← new: bundler config for better-sqlite3
└── index.html                  ← unchanged
```

---

## Local Dev

```bash
npm install
npm run db:init        # creates data/tracker.db and runs schema.sql
npm run dev            # netlify dev (requires netlify-cli)
```

On first `npm run db:init`, the DB is created and seeded with `status = 'Pants'` and `consecutive_days = 0`.

---

## Netlify Deploy

1. Set env var in Netlify dashboard:

   | Key | Value |
   |------|-------|
   | `DATABASE_URL` | `/tmp tracker.db` |

   **Important:** Netlify Functions have a `/tmp` filesystem. Files written there are ephemeral — they persist through a single function invocation but are wiped on cold start. For production with persistence, use Turso (`libsql-client`) instead of `better-sqlite3`. The `lib/db.js` interface stays the same.

2. Set `netlify.toml` to bundle `better-sqlite3`:

   ```toml
   [functions]
   node_bundler = "esbuild"
   ```

3. Deploy. The DB is initialized fresh on each cold start, seeded from `lib/schema.sql`.

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

If something breaks in prod, revert to the `airtable` branch:

```bash
git checkout airtable -- netlify/functions/ package.json
```

Keep `lib/` and `data/` around — they won't affect the Airtable build.

---

## Appendix: better-sqlite3 in Netlify Functions

**Why sync instead of async?** `better-sqlite3` is synchronous. Netlify Functions are single-threaded per invocation, so async doesn't help here. The sync API is simpler and slightly faster for short queries.

**Cold start:** `better-sqlite3` adds ~200-300ms to cold starts. If that matters, switch to `libsql-client` (async, Turso) — same `lib/db.js` interface, just swap the client.

**Note:** `status` table has `user_id` column added in `lib/schema.sql` for future multi-user support. The singleton constraint (`CHECK (id = 1)`) remains per-user — add a unique index on `(id, user_id)` when ready to scale.