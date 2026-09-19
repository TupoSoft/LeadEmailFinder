# SMTP Recipient Allowlist

## Order and Dependencies

| Key | Implementation PR | Dependencies |
| --- | --- | --- |
| `smtp-recipient-allowlist/01` | [Accept only configured SMTP recipients](01-accept-configured-recipients.md) | None |

One implementation PR owns the fixture contract, transport tests, Bruno coverage, and developer instructions.
These changes form one observable outcome and should be reviewed together.

## Shared Constraints

- Extend the existing `smtp-evidence` service. Keep its default acceptance behavior and all existing scenarios.
- Use exact address membership and the existing `550 5.1.1` missing-recipient response. Preserve STARTTLS,
  the reserved catch-all control, pending temporary rejections, and private Docker networking.
- The configuration is temporary and shared by all fixture connections. Serialize scenario changes and test runs.
- Keep application classification, billing, public HTTP contracts, Mailpit, DNS, and deployment topology unchanged.
- Keep the existing full Bruno collection's disposable-data requirement explicit. Resetting the SMTP scenario
  does not clear application results or pending credit reservations.
- Follow root `AGENTS.md` for issue assignment and project status when implementation starts. Plan creation
  does not start implementation, synchronize GitHub issues, or publish a pull request.
