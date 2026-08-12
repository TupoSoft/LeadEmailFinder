# Architecture rules

- Generate SOLID-oriented code, while favouring simple, testable designs over pattern-heavy abstractions.
- Each service or class owns one business responsibility.
- Controllers orchestrate requests only; application services own business rules.
- Depend on injected interfaces or tokens, never concrete infrastructure clients.
- Keep persistence, HTTP/SMTP, Redis, and provider-specific code behind small adapters.
- Prefer small, purpose-specific interfaces; do not create generic manager services.
- Repositories must not call SMTP or HTTP clients.
- Keep proxy allocation separate from email verification; model provider fallbacks as strategies or adapters.
- Add or update focused tests for every changed behavior, including contract tests for alternate implementations where appropriate.
- Before finishing, review the diff for SOLID violations and report any material architectural trade-offs.
