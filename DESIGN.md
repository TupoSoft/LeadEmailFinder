---
version: alpha
name: 'Lead Email Finder'
description: 'A precise, editorial interface that makes technical email-deliverability signals understandable and responsible.'
colors:
    primary: '#1F5A4A'
    canvas: '#F4F0E8'
    ink: '#132A2E'
    accent: '#F0643B'
    accent-text: '#B63817'
    sage: '#DCE6DC'
    page-background: '#E8E4DB'
    focus: '#132A2E'
    rule: 'rgb(19 42 46 / 45%)'
    rule-soft: 'rgb(19 42 46 / 20%)'
    circuit: 'rgb(31 90 74 / 58%)'
    circuit-strong: 'rgb(31 90 74 / 65%)'
    shadow: 'rgb(19 42 46 / 18%)'
typography:
    display:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '4.35rem'
        lineHeight: '0.94'
    display-large:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '6.5rem'
        lineHeight: '0.92'
    body:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '1rem'
        lineHeight: '1.45'
    product-heading:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '2.25rem'
        lineHeight: '1.1'
    compact:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '0.875rem'
        lineHeight: '1.45'
    utility:
        fontFamily: "'Inter Variable', Arial, Helvetica, sans-serif"
        fontSize: '0.75rem'
        lineHeight: '1.4'
rounded:
    DEFAULT: '0.125rem'
    control: '0.125rem'
    panel: '0rem'
    circle: '999px'
spacing:
    shell-header-height: '6rem'
    shell-sidebar-width: '14rem'
    state-min-height: '15rem'
    control-height: '2.75rem'
    unit: '0.25rem'
    control-gap: '0.75rem'
    content-gap: '1.5rem'
    section-gap: '5rem'
    page-gutter: '1.5rem'
    page-gutter-wide: '3rem'
    page-max: '90rem'
    rule-width: '1px'
    focus-outline-width: '0.1875rem'
    focus-outline-offset: '0.25rem'
    page-shadow-y: '0.25rem'
    page-shadow-blur: '1rem'
    signal-shadow-y: '0.2rem'
    signal-shadow-blur: '0.45rem'
    signal-node-size: '4rem'
    editorial-accent-height: '0.1875rem'
    editorial-accent-width: '2rem'
    motion-fast-milliseconds: 140
    motion-reduced-milliseconds: 0.01
components:
    application-shell:
        backgroundColor: '{colors.canvas}'
        textColor: '{colors.ink}'
        size: '{spacing.shell-header-height}'
    action:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.canvas}'
        rounded: '{rounded.control}'
        size: '{spacing.control-height}'
    form-control:
        backgroundColor: '{colors.canvas}'
        textColor: '{colors.ink}'
        rounded: '{rounded.control}'
        size: '{spacing.control-height}'
    application-background:
        backgroundColor: '{colors.page-background}'
        textColor: '{colors.ink}'
    focus-ring:
        textColor: '{colors.focus}'
        size: '{spacing.focus-outline-width}'
    rule:
        backgroundColor: '{colors.rule}'
        size: '{spacing.rule-width}'
    rule-soft:
        backgroundColor: '{colors.rule-soft}'
        size: '{spacing.rule-width}'
    signal-circuit:
        textColor: '{colors.circuit}'
    not-found-circuit:
        textColor: '{colors.circuit-strong}'
    elevation-shadow:
        backgroundColor: '{colors.shadow}'
        size: '{spacing.page-shadow-blur}'
    public-header:
        size: '{spacing.rule-width}'
    section-link:
        textColor: '{colors.primary}'
    signal-path:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.canvas}'
        rounded: '{rounded.circle}'
        size: '{spacing.signal-node-size}'
    principle:
        textColor: '{colors.primary}'
    responsibility-callout:
        textColor: '{colors.accent-text}'
    editorial-accent:
        backgroundColor: '{colors.accent}'
        height: '{spacing.editorial-accent-height}'
        width: '{spacing.editorial-accent-width}'
    public-footer:
        backgroundColor: '{colors.sage}'
        size: '{spacing.rule-width}'
        padding: '{spacing.content-gap}'
    not-found:
        backgroundColor: '{colors.canvas}'
        rounded: '{rounded.panel}'
        padding: '{spacing.section-gap}'
---

# Lead Email Finder Design System

## Overview

### Creative North Star

Lead Email Finder should feel like a carefully typeset technical field guide. Its structure borrows from signal-flow
schematics and editorial information graphics: a strong thesis, fine rules, terse annotations, and a clear path from
raw address to trustworthy technical evidence. The approved reference is
[`apps/web/design/concepts/public-entry-approved.png`](apps/web/design/concepts/public-entry-approved.png).

The interface serves people who need to assess whether an email address appears technically deliverable before they
send. It must explain evidence plainly while keeping the limits of that evidence visible. Technical precision and
human responsibility share the same hierarchy.

The implementation preserves the concept's two-field desktop composition, vertical narrow signal path, palette,
rules, and editorial hierarchy. It uses a self-hosted Inter variable font instead of a generated approximation. Normal-size
responsibility text uses the darker accent token, explanatory copy is larger, and both directional links have accurate
destinations and cues. At 320 CSS pixels the thesis wraps to four lines to retain its display scale. The generated
footer copyright line is omitted because this plan establishes no approved legal copy.

### Product Context and Register

- **Audience and primary job:** Outreach operators and technical teams who need to understand address syntax, domain,
  MX, and secure SMTP signals before deciding whether to send.
- **Target markets and evidence:** The repository does not define a country-specific market. This release uses the
  English-first policy in the frontend road map and does not infer market rules from that locale.
- **Locale and language policy:** The initial locale is `en`. Product copy is centralized by product area so a later
  localization decision does not require rewriting components.
- **Usage scene:** The public entry must remain legible on a 320 CSS-pixel phone and intentional on a 1440 by 900
  desktop. Later `/app/**` routes will support repeated product work.
- **Register:** Hybrid. `/` and the public not-found experience use a restrained brand register. Future authenticated
  routes under `/app/**` use a denser product register while retaining this identity.
- **Memorable signature:** The signal path links syntax, domain, MX, and secure SMTP as one readable technical sequence.
- **Restraint:** Typography, rules, and meaningful diagrams carry the composition. Routine controls and product screens
  favor familiarity, stable geometry, and clear state over brand expression.
- **Anti-references:** Avoid generic dashboard chrome, neon gradients, glass effects, excessive cards, decorative
  controls, stock data, fake terminal output, and any visual metaphor that implies certainty or permission.
- **Token ownership and runtime mapping:** This file is the normative token owner. The direct runtime adapter is
  `apps/web/src/styles/tokens.css`; `premium-ui.json` maps every primitive color, typography, rounded, and spacing
  token to a CSS custom property and every component value to its CSS consumers. `corepack pnpm ui:audit` fails on
  missing or stale mappings, literal component values, references that drift from consumers, runtime-only properties,
  primitive value drift, or raw component colors. Components consume semantic custom properties rather than repeating
  raw values.

## Colors

The palette is quiet enough for technical reading and distinctive enough to avoid generic software styling.

- `colors.canvas` (`#F4F0E8`) is the paper-like page background and the light foreground on dark signal nodes.
- `colors.ink` (`#132A2E`) is the primary text, rule, icon, and deepest signal color. Use it for high-contrast content,
  not as a decorative near-black field.
- `colors.primary` (`#1F5A4A`, evergreen) identifies navigation, links, signal nodes, and purposeful emphasis.
- `colors.accent` (`#F0643B`) marks the responsibility statement and rare editorial emphasis. It may form a
  nonessential outer focus halo, but it is not the focus outline, the default action color, or a large decorative wash.
- `colors.accent-text` (`#B63817`) carries responsibility copy where orange does not provide enough text contrast.
- `colors.sage` (`#DCE6DC`) separates the footer and other quiet supporting surfaces from the canvas.
- `colors.page-background` (`#E8E4DB`) frames the canvas. Rule, circuit, and shadow tokens are semantic alpha
  derivatives of ink and evergreen; components never repeat their raw color values.

Every foreground and background pairing must meet `WCAG 2.2 AA`. Ink belongs on canvas and sage. Canvas belongs on ink
or evergreen. Accent is used for larger emphasis and short rules; body-sized accent text needs a verified contrast-safe
treatment. Focus uses ink or evergreen for the required outline because orange alone does not reach 3:1 against bone.
Forced-colors mode yields to system colors instead of preserving brand color at the cost of operability. This first
release has one light theme; a dark theme requires a complete semantic remapping and visual verification rather than
local overrides.

## Typography

The product bundles Inter Variable from the pinned `@fontsource-variable/inter` package and falls back to
`Arial, Helvetica, sans-serif`. The browser makes no third-party font request, and the pinned font metrics keep the
settled layout and visual baselines stable across supported systems while preserving the concept's direct Swiss
editorial character. The OFL 1.1 notice ships with the application at `/licenses/inter-OFL.txt`.

- `typography.display` uses an 800-weight treatment, tight line height, and compact tracking for the public thesis.
  Its wide-screen reference size is 4.35rem with a 0.94 line height, and it scales down fluidly without changing the
  sentence hierarchy. `typography.display-large` gives the not-found statement a 6.5rem ceiling and 0.92 line height.
- `typography.body` is the default reading role at 1rem with a 1.45 line height. Keep paragraph measures near 55 to 68
  characters where the layout permits.
- `typography.compact` supports short explanatory sentences at 0.875rem with body leading. `typography.utility` is
  reserved for signal annotations, navigation labels, and metadata. It stays at or above 0.75rem and never carries
  essential long-form instructions.

Use weight and scale deliberately: display text is bold, section titles are strong, and paragraphs stay regular.
Sentence case is the default. Avoid all-caps decoration and artificial monospace styling for ordinary technical
content. Numeric and technical abbreviations such as MX and SMTP retain their conventional casing.

## Layout

The page uses a maximum content width of 90rem, wide gutters of 3rem, and fine one-pixel-equivalent rules. Desktop
composition is intentionally asymmetric: the thesis occupies the left field while the signal path moves through the
right field. Supporting principles form a quieter editorial sequence below.

At narrow widths, the composition becomes one column. The signal path rotates into a vertical sequence, labels stay
adjacent to their nodes, and navigation wraps or compresses without hiding destinations. Content order, language, and
links remain the same; responsive CSS must not render a second mobile information tree. At 320 CSS pixels there must
be no unintended horizontal scrolling, clipped text, or overlapping controls.

Use the spacing tokens as named roles. The 0.25rem unit supports optical adjustments; it is not permission to create
arbitrary multiples in feature CSS. Reserve stable space for media, focus outlines, and feedback. The document owns
page scrolling. Component-level overflow needs a named reason and must inherit the global scrollbar baseline.

## Elevation & Depth

The visual system is almost flat. Fine ink rules, whitespace, and the sage supporting surface establish hierarchy.
Static content panels do not use floating-card stacks, glass blur, or repeated drop shadows. The page frame uses a
0.25rem vertical offset and 1rem blur; signal nodes use a 0.2rem offset and 0.45rem blur. Both use the shared 18%
ink shadow token. The signal treatment cannot become a general container style.

Overlays introduced by later product plans must use the shared layer contract and preserve focus and scroll behavior.
They may use a small shadow only to communicate that they sit above the current task.

## Shapes

Edges are squared or use the two-pixel control radius. The public composition relies on rules, alignment, and circular
signal nodes rather than rounded containers. `rounded.circle` exists only for genuinely circular nodes, status marks,
or icon surfaces. It must not turn labels, navigation, or ordinary actions into pills.

Borders use the one-pixel-equivalent rule token and ink or a documented semantic derivative. Icons use simple outlined
geometry with a consistent stroke. Decorative icon containers are avoided unless the container communicates a real
state or step in the signal path.

## Components

### Foundational Visual States

Every enabled interactive element has a clear default, hover, focus-visible, and active state. Hover may add an
underline or deepen evergreen, but it never reveals the only copy or action. Focus uses a three-pixel ink or evergreen
outline with enough offset to remain visible against canvas and sage. Orange may add a wider halo, but the focus state
must remain distinct without it. Forced-colors mode uses the system highlight. Disabled, busy, validation, success,
warning, and error treatments will be defined with the first component that needs them and recorded here in the same
change set.

The default loading treatment for future product work is a stable app-owned indicator. Skeletons require a specific
layout need and must match final geometry. Buttons and links never change size while state changes.

### Public Header and Section Links

The public header contains the product name, real in-page links, and a working sign-in link. A fine rule anchors it to the content grid.
Section links use evergreen text and a thin underline that remains visible on focus. The same labels name their target
sections. Pricing, account settings, API tools, and placeholder actions stay absent until their workflows exist.

### Application Shell and Recovery States

The authenticated shell preserves the canvas, evergreen navigation, fine rules, and Inter typography. Its desktop
header reserves 6rem and its sidebar reserves 14rem. At widths of 48rem or below, navigation becomes an inline
disclosure above content. Opening it intentionally expands the document; it does not cover account information or
require a second navigation tree. The document remains the scroll owner.

Product headings use 2.25rem with a 1.1 line height. Shared state messages reserve at least 15rem for bootstrap,
recovery, and sign-out feedback. Account information wraps in full. The shared action treatment uses evergreen with
canvas text, the control radius, and a 2.75rem minimum height; secondary actions use canvas with evergreen text.
Hover and active states use ink or sage. Disabled actions retain their dimensions and use sage with ink text.
Pending state is expressed through readable status text and busy semantics, without continuous decorative motion.

### Product Data Panels and Billing

`ProductPanel` extends the shell's flat composition with fine rules, existing content spacing, and a reserved
feedback region. Billing places balance, credit packs, and purchase history in document order. Pack actions reuse
the shared primary and secondary treatments. The return notice uses sage with an evergreen rule; its text states
the payment status. Purchase history displays status labels as text and becomes labeled rows on narrow screens without
changing the data order. These components reuse the existing palette, typography, spacing, and motion tokens.

### Team Forms and Invitations

Team management and public invitation acceptance reuse the product heading, canvas, fine rules, and existing
action treatments. Shared fields in `Form.module.css` use the control height and radius, ink text, and canvas
background. Labels remain visible; validation text uses the contrast-safe accent text. Native role selects retain
the operating system's popup behavior. Member tables become labeled rows at narrow widths without duplicating data.

Team confirmation dialogs use the native modal layer with application-owned content, canvas, a fine rule, and a
bounded scrolling body. They place initial focus on Cancel for permission changes and disabling access, trap
keyboard focus, and return it to the trigger. One-time invitation results use that dialog with a copy action and
immediate secret cleanup. The public invitation page uses a single readable column and the existing brand link;
loading and recovery reserve the shared state height. This feature adds no palette, typography, or motion tokens.

### Signal Path

The signal path is explanatory content, not a progress control. Its four nodes use ink and evergreen circles on the
canvas, with adjacent labels and descriptions in document order. Decorative circuit traces are hidden from assistive
technology. The text sequence remains complete when the diagram is removed, colors are unavailable, or the viewport
collapses to one column.

### Principles and Not-Found Experience

Principles use icons, labels, and text without card containers. Respect, transparency, minimalism, and responsibility
are distinct content ideas; icons supplement their headings and never replace them. The not-found route reuses the
same typography, rules, and working home-link treatment. It states what happened without blaming the user.

### Iconography

Use one project-owned family of simple outline icons with rounded line ends and consistent optical size. The signal
nodes may reverse those icons onto dark circles. Essential meanings always have visible text labels, and decorative
traces or marks have no accessible name.

### Motion

Motion is short, restrained, and tied to navigation or state. The current feedback duration is 140 milliseconds;
content movement must finish within 240 milliseconds. The machine-readable duration is stored as a number without a
unit because the alpha `Design.md` format has no motion group. Use standard ease-out timing and allow
interruption. Ambient or continuous motion is not part of this identity.

Under `prefers-reduced-motion: reduce`, reduce decorative durations to 0.01 milliseconds and remove transforms and
smooth scrolling. Content, focus order, and information hierarchy remain unchanged.

### Content and Data Visualization

The voice is concise, factual, and respectful. Describe technical signals and their limits; do not claim guaranteed
delivery, consent, or permission. Action labels name the actual destination or operation. Diagrams and later charts
need a text equivalent and may not depend on color alone.

## Do's and Don'ts

- **Do:** Use the signal-flow language to explain real technical stages and relationships.
- **Do:** Preserve the approved hierarchy, exact semantic palette, fine rules, and strong system-sans typography.
- **Do:** Keep the responsibility statement visible wherever a design could otherwise imply permission to contact.
- **Do:** Reuse semantic tokens and shared behavior, then update this contract when an approved system decision changes.
- **Don't:** Add fake controls, fake data, or decorative UI that looks actionable.
- **Don't:** use generic neon gradients, glass surfaces, card grids, or dashboard chrome on the public entry.
- **Don't:** turn every label or action into a pill, or use shadows as routine section boundaries.
- **Don't:** trade contrast, visible focus, stable layout, or reduced-motion behavior for fidelity to a screenshot.
