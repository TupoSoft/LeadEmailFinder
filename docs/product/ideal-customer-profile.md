# Ideal Customer Profile

Status: Working hypothesis documented on 2026-09-08. This ideal customer profile (ICP) provides planning context for
AI agents. It distinguishes repository evidence from commercial assumptions that still need customer research or
sales evidence.

## Working Profile

Lead Email Finder's primary customer hypothesis is a business-to-business (B2B) outreach team or lead-generation
agency that regularly verifies existing email lists before sending messages.

B2B outreach means contacting people at other companies to introduce a product, offer a service, or explore a
partnership. This profile focuses on the address-verification step of that workflow.

| Dimension | Working hypothesis |
| --- | --- |
| Customer organization | A business with recurring outreach work and email addresses it already holds or obtains elsewhere. |
| Buyer | An agency owner, Head of Sales, or revenue-operations lead responsible for outreach quality and spending. |
| Daily users | Outreach specialists, sales-operations staff, and developers integrating verification into existing workflows. |
| Primary job | Assess whether supplied email addresses appear technically able to receive messages before deciding whether to send. |
| Desired value | Identify invalid or uncertain addresses, reduce avoidable bounces and manual checking, and understand the evidence behind a result. |
| Buying trigger | Preparing a new contact list, revisiting an older list, investigating address-quality problems, or automating repeated checks. |
| Secondary segment | Software teams embedding email verification into their own products or internal workflows through the API. |

The segments, commercial roles, buying triggers, and desired value above are hypotheses. They do not establish
measured outcomes, paying customers, or a ranking validated by research. Commercial job titles are separate from
the application's authorization roles.

## Repository Evidence

The documented audience is broader than the working commercial profile: outreach operators and technical teams
assessing address syntax, domain, MX, and secure SMTP signals before deciding whether to send.

| Evidence | What it supports | Source |
| --- | --- | --- |
| Outreach operators and technical teams are the named audience. | The outreach and technical-user focus. | [Design context](../../DESIGN.md#product-context-and-register) |
| Verification processes customer-supplied target addresses. | Customers bring addresses to check. | [Processing contract](../privacy/email-verification-processing-contract.md#scope-and-terminology) |
| The verification module exposes synchronous, asynchronous, and CSV-batch workflows. | Individual checks, repeated list work, and API integration. | [Verification module](../../src/libs/modules/email-verification/README.md#responsibility) |
| Team membership belongs to an organization, and owners can manage their team. | Collaborative use within customer organizations. | [Team workflow](../../.agents/plans/frontend/13-manage-organization-team.md) |
| Customers purchase fixed one-time credit packs. | Purchasing credits for verification usage. | [Payment direction](../../.agents/plans/payments/README.md) |

Repository capabilities support the profile's plausibility; they do not prove market demand or production readiness.
The browser road map separately tracks [batch verification](../../.agents/plans/frontend/12-run-batch-email-verification.md)
and [service-client management](../../.agents/plans/frontend/14-manage-service-clients.md). Check their current progress
and implementation before claiming those browser experiences are available. Backend API support alone does not
establish browser feature availability.

## Guidance for AI Agents

- Use the working profile when choosing examples, explaining value, or comparing product proposals. Favor concrete
  tasks such as checking a supplied list or integrating verification into a customer's workflow.
- Explain evidence and uncertainty in plain language. The desired reduction in bounces is a customer goal, not a
  measured product claim. A completed verification can still have an unknown result.
- Keep the supplied-address verification focus explicit. The project name alone does not establish a lead database,
  contact-sourcing service, campaign sender, or ready-made integration with a sales platform.
- Preserve the [processing contract](../privacy/email-verification-processing-contract.md) and the
  [public product message](../../apps/web/src/content/public-entry.ts): a deliverability signal does not establish
  guaranteed delivery or permission to contact someone.
- Treat this profile as product context. The current task and ExecPlan determine implementation scope.
  The [design contract](../../DESIGN.md) and [UX contract](../../UX-CONTRACT.md) govern shared presentation and behavior.
- Recheck the relevant module documentation, implementation, and plan status before making capability claims.
  Record new customer evidence and its date before promoting a hypothesis to a validated fact.

## Open Validation Questions

The repository evidence cited above does not establish:

- Which primary segment has the strongest demand: internal outreach teams or agencies.
- Which commercial role buys the product and which role uses it most often.
- Target company size, industry, geography, or monthly verification volume.
- Budget, willingness to pay, price sensitivity, or preferred purchasing arrangements.
- Measured accuracy, reduction in bounces, time savings, or customer retention.
- Which acquisition channels reach these customers effectively.

Keep these fields open until supported by customer interviews, observed usage, or commercial evidence. The current
English interface does not establish a geographic target market.
