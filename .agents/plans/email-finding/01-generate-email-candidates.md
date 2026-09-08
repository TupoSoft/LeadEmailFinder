# Generate a Bounded Set of Email Candidates

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Given a first name, last name, and company domain, produce a repeatable, bounded list of possible email addresses.
A developer can call a pure application capability with Jane, Doe, and `example.com` and observe candidates such
as `jane.doe@example.com` and `jdoe@example.com`, together with their pattern identities. This pull request supplies
the input and generation contract for later finding work without contacting a mail server.

## Progress

- [ ] (2026-09-08) Add the normalized input, candidate, and validation-error contracts.
- [ ] (2026-09-08) Implement deterministic normalization, domain validation, expansion, and deduplication.
- [ ] (2026-09-08) Cover accepted, unsupported, colliding, and boundary inputs with focused tests.
- [ ] (2026-09-08) Update the module documentation and record validation evidence.

## Plan dependencies

None.

## Surprises & Discoveries

- `src/libs/common/src/enums/email/email-pattern.enum.ts` already defines 16 templates. Their current consumers
  store optional `format` metadata; none expands a person's names into addresses.
- The single and batch verification request contracts accept complete addresses. They provide no name contract
  to reuse, so this plan establishes one without changing those requests.

## Decision Log

- Decision: Keep generation within `email-verification`, as pure domain and application code.
  Rationale: It serves the existing verification engine and needs neither a new public module nor infrastructure.
  Date/Author: 2026-09-08, Codex planning for the requested finder.
- Decision: Version 1 generates ASCII local parts after explicitly defined normalization. Reject unsupported
  names instead of guessing a transliteration.
  Rationale: The current SMTP path has no internationalized mailbox contract. Diacritic removal is an explicit
  spelling heuristic and cannot establish the person's actual address.
  Date/Author: 2026-09-08, Codex.
- Decision: Preserve the exact supplied domain, including subdomains, and freeze the template order in a private
  versioned array. Remove duplicates while retaining every contributing pattern.
  Rationale: A credit budget makes order observable, and extending a shared enum must not silently change a search.
  Date/Author: 2026-09-08, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and
`src/libs/modules/email-verification/README.md` before implementation. The module owns existing address checks and
their stored evidence. `src/index.ts` exports only its Nest composition module. Pure domain code belongs under
`src/domain/`; orchestration belongs under `src/application/`; neither may import Nest, TypeORM, or provider clients.

Within this plan, a token is the normalized first or last name used in a template. A candidate is an address to
check, not an assertion that the address exists. A generation version freezes normalization and template order
so a persisted search can resume without silently changing its candidates after a code upgrade.

## Scope and Non-Goals

Add private input normalization and generation contracts, focused tests, and module documentation. Existing enum
values remain unchanged. This plan performs no DNS lookup, SMTP probe, credit operation, database write, queue
dispatch, HTTP request, or browser change. It adds no name dictionary, arbitrary template syntax, middle-name field,
internationalized SMTP local part, person lookup, domain-synonym discovery, or guessed transliteration.

## Plan of Work

Add `src/libs/modules/email-verification/src/domain/finding-input.ts` for plain contracts and typed errors, and
`src/libs/modules/email-verification/src/application/finding/generate-email-candidates.ts` for a pure generation
function. Name and domain normalization may use separate private helpers beside it. Node's pure `domainToASCII`
and `isIP` utilities are allowed; no network adapter is needed. Reuse the existing `EmailPatternEnum` values but
do not dynamically enumerate that enum to define version 1.

Validate both names as strings of at most 100 Unicode code points before normalization. Reject control characters
and require nonempty values after trimming. Apply NFKD normalization, lowercase, remove combining marks, Unicode
space separators, straight apostrophes, the right single quotation mark, and ASCII hyphens. The remaining token
must contain 1 through 64 characters matching `[a-z]+`. Thus, `José` becomes `jose`, `O’Neil` becomes `oneil`, and
`Mary-Jane` becomes `maryjane`. Non-Latin names, symbols, digits, punctuation not listed here, and characters such
as `ß` that remain unsupported produce a field-specific error. Do not silently drop an unsupported character.

Validate the domain as a string of at most 253 characters before conversion. Trim surrounding whitespace, permit
one final DNS root dot and remove it, convert the complete hostname to ASCII with IDNA, and lowercase it. Before
conversion reject control characters, internal whitespace, slashes, backslashes, schemes, `@`, colons, brackets,
wildcards, ports, and query or fragment delimiters. Require at least two labels. Every label contains 1 through 63
ASCII characters using letters, digits, and internal hyphens, with no leading or trailing hyphen; the complete result is at most
253 bytes. Reject IP literals, single-label hosts, empty labels, invalid conversion, and numeric final labels.
Keep a supplied subdomain. Do not remove `www`, replace a hostname with its registrable domain, or perform a DNS
existence test. Syntactic validation does not decide the module's separately owned domain policy.

Freeze this ordered template list in version 1:

```text
{first}, {last}, {first}.{last}, {f}{last}, {f}.{last}, {first}{last},
{first}{l}, {first}.{l}, {last}.{first}, {first}_{last}, {last}{f},
{f}{l}, {l}{first}, {l}.{first}, {last}{first}, {first}-{last}
```

Here `f` and `l` are the first ASCII letters of their corresponding normalized tokens. Expand only these fixed
templates. Omit a candidate whose local part exceeds 64 ASCII bytes or whose complete address exceeds 254 ASCII
bytes. Record the omitted template and fixed reason `address_too_long`; this means the report never claims that
every template was applicable. Reject the input with `no_candidates` if every template is omitted.

Deduplicate by complete normalized address, keeping the first position and merging contributing patterns in
template order. Assign contiguous zero-based indexes after deduplication. All generated addresses use exactly
the normalized domain. Return normalized tokens only to the caller; later workflow persistence can retain the
candidate list without keeping the original names. Do not log input or validation values.

Add focused tests beside the helpers. Assert literal expected outputs for representative people, the full Jane
Doe sequence, collisions such as first and last token `a`, Unicode normalization, IDNA, root dots, subdomains,
unsupported scripts and punctuation, malformed domains, and local-part and whole-address boundaries. Vary input
case and permitted spacing to prove equivalent normalized outputs; verify the input object remains unchanged.
Update the module README to identify this private capability and its limitations.

## Interfaces and Dependencies

```typescript
type FindingInput = { firstName: string; lastName: string; domain: string }
type EmailCandidate = { index: number; email: string; patterns: EmailPatternEnum[] }
type GeneratedEmailCandidates = {
    generationVersion: 1
    normalized: { firstName: string; lastName: string; domain: string }
    candidates: EmailCandidate[]
    omittedPatterns: { pattern: EmailPatternEnum; reason: 'address_too_long' }[]
}
```

`generateEmailCandidates(input: FindingInput): GeneratedEmailCandidates` is synchronous and deterministic. Its
typed error contains only `field: firstName | lastName | domain | input` and a closed validation code, never the
submitted value. Later API adapters map these codes to reviewed messages. Export nothing through the module's
public barrel. No dependency or package installation is required.

## Acceptance Criteria

- Jane Doe at `Example.COM.` generates the specified 16 unique addresses in the frozen order at `example.com`.
- Inputs that normalize equivalently return identical candidate addresses, order, patterns, and version.
- Unsupported characters or malformed domains produce a typed field error and no candidate result. Valid
  subdomains and IDNA hostnames remain their exact canonical hostnames.
- Colliding templates produce one candidate with all corresponding patterns. Candidates exceeding length limits are omitted
  with the specified reason, and every returned address meets both length bounds.
- No input can produce more than 16 unique candidates, expand a different domain, or trigger network or storage
  activity. Existing single-email and batch contracts remain unchanged.
- Focused tests, semantic type checking, the module architecture gate, and documentation lint pass.

## Validation

The following test files are new implementation deliverables, not existing validation evidence:

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/application/finding/generate-email-candidates.spec.ts src/libs/modules/email-verification/src/application/finding/normalize-finding-input.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/email-finding/01-generate-email-candidates.md
```

Bruno is not applicable to this pull request: the capability is private and changes no HTTP behavior. Unit tests
must use literal expected addresses rather than deriving expected values with the same template expansion logic.
No runtime provider validation is required for a pure generator.

## Idempotence and Recovery

Repeating the function has no effects and returns the same value for equivalent input. The implementation creates
no persisted state and needs no reset or migration. Keep future policy changes under a new generation version;
do not mutate a persisted version 1 candidate list during later workflow recovery.

## Artifacts and Notes

The source enum is a useful vocabulary, not evidence that finding already works. All implementation progress is
unchecked at authoring time. Generation only suggests addresses; verification and person attribution are distinct.

## Plan readiness

Ready to implement
