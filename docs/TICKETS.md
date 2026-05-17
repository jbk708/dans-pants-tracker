# dans-pants-tracker — Remaining Work

---

## Completed

- **T-A:** Airtable → Turso migration (PR #1)

---

## P1 — Current

### UI Overhaul

- ~~**T-01:** Redesign index.html — PR #3~~
  Replace minimal inline styles with a clean, modern UI. Larger status text, better fonts, subtle shadows and spacing.

- ~~**T-02:** Add visual feedback — PR #3~~
  Animate status transitions. Button press effects and hover states. Smooth fade or scale on state change.

- **T-03:** Mobile responsiveness
  Buttons and text readable on small screens. Touch-friendly tap targets.

### Core Features

- **T-04:** Status history view
  Paginated list of past status changes — who, what, when. Fetch via a new GET /history endpoint.

---

## P2 — Next

### UX Improvements

- **T-05:** Dark mode
  System-preference-aware dark/light theme toggle. Persist preference in localStorage.

- **T-06:** Better loading and error states
  Skeleton or spinner while fetching. Clear error messages on failure (no more raw "Failed to fetch status").

### New Features

- **T-07:** Streak visualization
  Small calendar heatmap or flame counter showing the current consecutive-days streak visually.

- **T-08:** Multiple user support
  Track which household member logged the status. Optional: add a name input or account selector.

---

## P3 — Backlog

### Quality

- **T-09:** Add unit tests
  Test db.js validation logic and streak refresh behavior. Can use Vitest or Jest.

- **T-10:** Type safety for Netlify functions
  Add JSDoc or migrate functions to TypeScript. Type the request/response shapes.

- **T-11:** Remove dead code and old Airtable artifacts
  Any leftover airtable config, old env var names, or migration scripts that are no longer needed.

### Documentation

- **T-12:** Update README
  Reflect Turso migration, required env vars, and local dev setup steps.

---

## Dependency Notes

- T-04 (history endpoint) unblocks T-07 (streak viz)
- T-01/T-02 (UI) should land before T-05 (dark mode) to avoid patching twice
- T-11 (dead code cleanup) should run after all feature work settles