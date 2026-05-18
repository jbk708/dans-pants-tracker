# dans-pants-tracker — Remaining Work

---

## Completed

- **T-A:** Airtable → Turso migration (PR #1)
- **T-01–T-08:** UI overhaul, mobile, history, dark mode, streak viz, multi-user (PRs #3–#7)
- **T-09–T-12:** Tests, types, cleanup, README (PR #8)

---

## Sprint 3 — Historical Stats

### Dashboard

- **T-13:** Stats dashboard view
  Build a `/stats` page showing aggregate data: total days logged, longest streak, most-active user, fire rate over time.

- **T-14:** Weekly/monthly summary cards
  Compact summary blocks above the history list. Show "X days fire this week" and "Y day streak".

### Visualization

- **T-15:** Streak timeline chart
  A horizontal timeline or bar chart showing fire/no-fire days over the last 30–90 days. Built with a lightweight lib or inline SVG.

- **T-16:** Per-user breakdown
  Filter stats and charts by household member. Show who has the longest current streak, most fires, etc.

### Export

- **T-17:** CSV/JSON export
  Add an export button on the history page to download all records as a CSV or JSON file.

---

## P3 — Backlog

- **T-18:** Email or push notification when a fire streak is at risk (e.g., no log by EOD)
- **T-19:** PWA / installable app with offline history view
- **T-20:** Recurring calendar import (.ics) so fire days appear on a shared calendar

---

## Dependency Notes

- T-13 (stats dashboard) depends on T-04 (history endpoint — already shipped)
- T-16 (per-user) depends on T-08 (multi-user support — already shipped)
- T-17 (export) can land independently