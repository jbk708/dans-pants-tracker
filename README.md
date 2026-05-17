# Dans Pants Tracker

Asking the important questions — like whether Dan is wearing pants or shorts today.

## Tech Stack

- **Frontend:** Vanilla HTML/JS, Inter font, CSS variables + dark mode
- **Backend:** Netlify Functions (Node.js)
- **Database:** Turso (edge-replicated SQLite via `@libsql/client`)
- **Features:** Status tracking, consecutive-day streak, history log, multi-user, streak flame viz

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/jbk708/dans-pants-tracker.git
cd dans-pants-tracker
npm install
```

### 2. Create a Turso database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/r/install.sh | bash

# Create database
turso auth login
turso db create dans-pants-tracker

# Initialize schema
turso db shell dans-pants-tracker < lib/schema.sql

# Get credentials
turso db show dans-pants-tracker    # copy TURSO_DATABASE_URL
turso db tokens create dans-pants-tracker  # copy TURSO_AUTH_TOKEN
```

### 3. Set env vars

```bash
export TURSO_DATABASE_URL="libsql://tracker-xxxx.dans-pants-tracker-xxxx.turso.io"
export TURSO_AUTH_TOKEN="eyJ..."
```

### 4. Run locally

```bash
npm run dev
```

Visit `http://localhost:8888`.

---

## Deploy to Netlify

Add these environment variables in **Netlify → Site → Environment Variables**:

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | From `turso db show` |
| `TURSO_AUTH_TOKEN` | From `turso db tokens create` |

Then push to `main` — Netlify deploys automatically.

---

## Testing

```bash
npm test
```

Tests cover `validateStatus()` input validation in `tests/db.test.js`.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.netlify/functions/getStatus` | GET | Current status + streak |
| `/.netlify/functions/setStatus` | POST | `{ "status": "Pants" \| "Shorts" }` |
| `/.netlify/functions/getHistory` | GET | Paginated history log |