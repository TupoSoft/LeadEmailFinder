# `DESIGN.md` To Runtime Token Mapping

Repository adaptation: LeadEmailFinder uses the explicit mapping in `premium-ui.json` and the maintained CSS adapter in `apps/web/src/styles/tokens.css`. Run `corepack pnpm ui:audit` to check drift. The export and Tailwind examples below describe other systems; do not add generated token files or another adapter to this project.

Read this whenever creating `DESIGN.md`, adopting an existing design system, changing a global token, adding a theme, or noticing that documented values differ from rendered UI. The goal is one traceable value path, not two manually maintained token systems.

## Choose an Ownership Model

Record one model in `DESIGN.md` or the design-system package documentation.

### Model a: `DESIGN.md` Generates Runtime Tokens

Use when a new project or team intentionally adopts `DESIGN.md` as the token source.

```text
DESIGN.md
  → designmd lint
  → designmd export
  → generated CSS/Tailwind/DTCG artifact
  → framework theme adapter
  → shared component
```

Generated artifacts are not hand-edited. Commit them only if the repository's generated-file policy requires it, and regenerate/check them in CI.

### Model B: Existing Runtime Token System Remains Canonical

Use for a mature codebase whose CSS variables, theme package, Figma variables, or DTCG files already have ownership and tooling.

```text
existing canonical tokens
  → runtime CSS/theme
  → shared component
  ↘ DESIGN.md mirrors exact accepted values and explains intent
```

Extract values into `DESIGN.md` and add drift verification. Do not reverse ownership casually during a feature task. Adopting generated tokens later requires a separate system change.

## Build a Mapping Manifest

For every durable token used by the changed surface, be able to trace:

| `DESIGN.md` path | Semantic role | Runtime target | Theme adapter | Consumers | Owner |
|---|---|---|---|---|---|
| `colors.primary` | Primary brand/action role | `--color-primary` | `theme.colors.primary` | Button, link, focus treatment | Design system |
| `colors.danger` | Destructive/error role | `--color-danger` | `theme.colors.danger` | Alert, field error, destructive button | Design system |
| `typography.body-md` | Default body text | `--font-body`, `--text-body-md`, `--leading-body-md` | `theme.typography.bodyMd` | Page copy, fields, tables | Design system |
| `rounded.md` | Standard control/container radius | `--radius-md` | `theme.radii.md` | Input, button, card | Design system |
| `spacing.md` | Standard internal rhythm | `--space-md` | `theme.spacing.md` | Form gap, card padding | Design system |
| `components.button-primary` | Primary button visual state | component variables or recipe tokens | `theme.components.button.primary` | Shared Button only | Component owner |

These names are examples, not required naming. Preserve the repository's existing vocabulary. Store the project-specific manifest in the maintained token package docs, `DESIGN.md` Components prose, or another existing design-system artifact; do not create a second manifest if one already exists.

## Map by Semantic Role, Not Raw Value

Use layers when the product supports themes or multiple brands:

```text
primitive palette → semantic role → component role → rendered state
```

Example:

```text
colors.blue-600
  → colors.primary
  → components.button-primary.backgroundColor
  → --button-primary-bg
  → <Button intent="brand" emphasis="solid">
```

Components consume semantic/component tokens, not raw hex values. Dark mode may map `primary` or `surface` to a different primitive while retaining meaning. Never infer that two tokens are interchangeable merely because their current values match.

## CSS Custom Properties

A direct implementation may map `DESIGN.md` values to stable variables:

```css
:root {
  --color-primary: #2457d6;
  --color-on-primary: #ffffff;
  --radius-md: 0.5rem;
  --space-md: 1rem;
  --font-body: "Inter", system-ui, sans-serif;
  --text-body-md: 1rem;
  --leading-body-md: 1.5;
}

.button-primary {
  color: var(--color-on-primary);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}
```

For themes, override semantic variables under the theme selector/provider. Do not duplicate component CSS per theme when semantic remapping is sufficient.

## Tailwind Versions 3 and 4 and Framework Themes

### Export for Version 3 (Configuration-Based)

The official CLI exports token groups for Tailwind version 3 configurations:

```bash
npx -p @google/design.md designmd export --format css-tailwind DESIGN.md > theme.generated.css
npx -p @google/design.md designmd export --format json-tailwind DESIGN.md > tailwind.theme.generated.json
npx -p @google/design.md designmd export --format dtcg DESIGN.md > tokens.generated.json
```

Export output is a starting contract, not proof that every application alias exists. If the project uses utilities such as `text-base` or framework keys such as `theme.colors.primary`, define an explicit adapter from generated token names to those established aliases.

### Tailwind Version 4 `@theme inline` (CSS-Driven)

Tailwind version 4 replaces the JavaScript configuration with CSS `@theme` blocks. Every `--*` variable under `@theme inline` becomes a Tailwind utility class automatically (`text-primary-600`, `font-sans`, `rounded-default`). There is no separate configuration to maintain.

**Which ownership model applies?** The same two models from above — your choice depends on whether `DESIGN.md` or the existing codebase is the authoring layer:

**Model A (`DESIGN.md` generates) + version 4:**

```text
DESIGN.md
  → designmd export --format css-tailwind
  → generated @theme inline block (committed, regenerated on change)
  → shared component via Tailwind utilities
```

Use when you want `DESIGN.md` as the single authoring layer and the `@theme` block is a generated artifact. The export command produces compatible `@theme` output:

```bash
npx -p @google/design.md designmd export --format css-tailwind DESIGN.md > theme.generated.css
```

Do not hand-edit the generated `@theme` block; change `DESIGN.md` and reexport.

**Model B (existing runtime is canonical) + version 4:**

```text
existing @theme inline block (hand-authored in globals.css)
  → runtime CSS variables
  → shared component
  ↘ DESIGN.md mirrors exact accepted values
```

Use when the project already has a hand-maintained `@theme` block. `DESIGN.md` documents and explains intent but does not generate. Changes happen in the CSS first, then `DESIGN.md` is updated.

**Scanning a version 4 project (both models):** Read the `@theme inline` block from the global CSS to extract token values for `DESIGN.md`. The block defines every `--color-*`, `--font-*`, `--radius-*`, etc. that becomes a utility.

**Framework adapter (version 4):** the `@theme` variables in version 4 are already CSS custom properties, so a runtime ThemeProvider can consume them directly without configuration indirection:

```ts
export const theme = {
  colors: {
    primary: "var(--color-primary-600)",
  },
  radii: {
    control: "var(--radius-default)",
  },
};
```

In version 4, `@theme` also supports `@variant` and `@custom-variant` for dark mode, reducing the need for separate theme providers. Export generators that produce `tailwind.config.js` or `json-tailwind` output for version 3 are not compatible with version 4.

### General Framework Rule

Avoid manually copying a `DESIGN.md` value into Tailwind configuration, CSS variables, and a ThemeProvider independently in any version. One path owns the runtime value; the other layers adapt that value.

## Typography Mapping

Typography tokens are composite. Map every relevant property, not only `fontSize`:

```text
typography.body-md
  → family + size + weight + line-height + letter-spacing
  → CSS variables/theme text style
  → shared Text/body recipe
```

Verify supported-script fallbacks and font metrics. A Japanese fallback with a different line box may require an intentional locale-aware line-height or stack, documented in `DESIGN.md`, rather than a screen-local override.

## Component State Mapping

Map state variants through shared primitives:

```text
components.button-primary
components.button-primary-hover
components.button-primary-active
  → Button recipe state tokens
  → :hover / :active / data-state selectors
```

Do not encode behavioral states such as `busy`, `disabled`, or `invalid` only as colors. Runtime components still own semantics, ARIA, events, focus, geometry, and state transitions; `DESIGN.md` owns visual treatment and rationale.

## Existing-Code Extraction

When creating `DESIGN.md` from a mature app:

1. Find the canonical token source and all theme entry points.
2. Trace representative shared components to actual consumed tokens.
3. Identify aliases, deprecated names, literals, and one-off overrides.
4. Record only accepted shared values as normative `DESIGN.md` tokens.
5. Put unexplained literals and conflicting aliases in the migration ledger; do not average them into a new token.
6. Confirm rendered values with browser computed styles in representative states/themes.

## Change Protocol

For any system-level token change:

1. State whether `DESIGN.md` or an existing runtime token package owns the value.
2. Change the owner once.
3. Regenerate or update the adapter and affected shared primitive.
4. Search for hardcoded old values and deprecated token aliases.
5. Lint `DESIGN.md` and run token drift checks.
6. Test contrast and state differentiation.
7. Run component stories and visual regression across themes, locales, and representative viewports.
8. Record intentional breaking visual changes and migration scope.

## Drift Gates

Prefer deterministic checks over visual memory:

- `designmd lint DESIGN.md` for structure, references, and component contrast findings;
- `designmd diff` for token/prose changes;
- Regenerate exports in CI and fail when the working tree differs;
- Static checks against forbidden raw colors/spacing in feature code when the repository supports them;
- Storybook/state screenshots for rendered outcomes;
- Runtime assertions or token snapshot tests only when they provide stable signal.

A successful export does not validate application aliases or rendered themes. A screenshot does not prove token ownership. Use both structural and visual evidence.
