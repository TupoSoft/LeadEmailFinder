# Japan Regulated Flows

Load this only when a Japan-market task touches privacy, commerce, subscriptions, payments, identity, consent, public service, healthcare, finance, or another regulated domain. It is a routing and evidence contract, not legal advice.

## Authority Gate

- Locate current authoritative Japanese law, regulator guidance, maintained legal copy, and product/domain policy before implementation.
- Record source, owner, reviewed date, applicable market/entity, and UI consequence. Do not paste entire legal policy into `UX-CONTRACT.md`.
- If authority is missing, contradictory, or stale, stop the affected decision and escalate to the product/legal owner. Never invent consent language, retention periods, cancellation rights, tax treatment, or identity requirements.
- Do not copy a GDPR cookie banner or another market's pattern into Japan by default. Cross-market obligations must be established independently.

## Privacy and Consent

For APPI/personal-information flows, verify the purpose-of-use disclosure, collection context, third-party or cross-border transfer behavior, correction/contact path, retention/deletion policy, and consent or notice requirements from authoritative sources. Make the UI consequence understandable without replacing legal review.

## Commerce and Subscriptions

When applicable, verify from the maintained commerce contract and current authority:

- price, consumption-tax inclusion/exclusion, fees, shipping, delivery, returns, seller/contact information, and payment timing;
- subscription cadence, renewal, cancellation, trial conversion, and recurring-payment disclosure;
- A final confirmation step that clearly distinguishes review from commitment;
- The ability to inspect and correct order details before commitment;
- The exact committing action label and durable confirmation/receipt path.

Tax, rounding, invoice, and receipt behavior are domain rules. Locale formatting alone does not determine them.

## Identity, Support, and Assisted Flows

Verify identity evidence, name/address representations, foreign-resident handling, proxy or assisted-service rules, support channels, and escalation paths from the domain contract. Avoid designing a Japan-native flow that excludes legitimate Latin names, international phone numbers, or bilingual support needs.

## Verification and Handoff

Test review/edit/commit boundaries, duplicate submission, timeouts, uncertain completion, accessible error recovery, copy consistency, audit evidence, and direct-link/back-navigation behavior. Report the exact authoritative sources used, what they establish, and every unresolved legal or policy dependency.
