# Business module README roadmap

This roadmap makes every business capability under `src/libs/modules` independently understandable without
duplicating the repository-level development guide. Each plan follows `.agents/PLANS.md` and represents exactly one
pull request.

1. [Document every business module](01-document-all-business-modules.md)

Shared decisions:

- A module README explains ownership, public surface, dependencies, runtime behavior, configuration, persistence,
  and focused validation; the repository root README remains the source of truth for starting the complete stack.
- The final module set is `auth`, `bff-session`, `credits`, `identity`, `proxy`, `payments`,
  `organization-onboarding`, `service-client-management`, and `email-verification`.
- Technical libraries directly under `src/libs` are outside this roadmap because they are not business modules under
  the ownership convention in `src/libs/modules/README.md`.
- Documentation must describe current code after the module-boundary relocation roadmap completes. It must not
  promise planned behavior, expose secrets, or copy setup instructions that already have an authoritative home.
