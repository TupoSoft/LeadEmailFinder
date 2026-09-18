# Batch CSV Guidance Road Map

These plans make the accepted CSV structure visible before upload and provide a matching sample file.
Each numbered ExecPlan follows `.agents/PLANS.md` and corresponds to exactly one implementation pull request.

## Order and Dependencies

1. [Explain the batch CSV format with an inline example](01-explain-csv-format.md) — depends on `frontend/12`.
2. [Download the displayed CSV example](02-download-sample-csv.md) — depends on `batch-csv-guidance/01`.

## Shared Constraints

- Reuse the existing upload page, approved design, centralized English copy, and native file picker.
- Keep one source for displayed and downloaded CSV bytes, using fictional addresses under `example.com`.
- Preserve server validation, upload limits, authorization, charging, polling, and recovery behavior.
- Each PR includes focused component and browser coverage using the existing desktop and narrow Chromium projects.
  Mock API responses; do not require SMTP or create real verification jobs.
- Update the batch behavior in `UX-CONTRACT.md` during implementation. Reuse existing shared visual decisions in
  `DESIGN.md`, runtime styles, and `premium-ui.json`.
- Add no API endpoint, parser dependency, provider, database migration, analytics, or production deployment work.
