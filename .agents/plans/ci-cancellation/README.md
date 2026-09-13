# Validation Cancellation

Implement [01: Cancel obsolete validation runs](01-cancel-obsolete-validation.md) in one pull request.
Base the pull request on `master`. Runner routing remains in the separate #595 pull request.

Group runs by workflow and Git ref. Preserve failure reporting, browser cleanup, and validation commands.
