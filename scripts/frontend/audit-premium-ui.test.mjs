import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
    auditProject,
    exitCodeFor,
    parseArguments,
    parseCanonicalMap,
    parseDesignFrontmatter,
} from './audit-premium-ui.mjs'

const temporaryRoot = process.platform === 'linux' ? '/tmp' : os.tmpdir()

const validDesign = `---
version: alpha
name: "Fixture"
description: "A concrete fixture design."
colors:
  canvas: "#F4F0E8"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
rounded:
  control: "0.125rem"
spacing:
  page-max: "90rem"
components:
  link:
    textColor: "{colors.canvas}"
---

# Fixture Design System

Approved reference: design/concept.png.

## Overview

Fixture overview.

## Colors

Fixture colors.

## Typography

Fixture type.

## Layout

Fixture layout.

## Elevation & Depth

Fixture depth.

## Shapes

Fixture shapes.

## Components

Fixture components.

## Do's and Don'ts

Fixture rules.
`

const validUxContract = `# UX Contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Scrollbar | Global application stylesheet | DESIGN.md | Geometry exceptions | Browser computed style |
`

const validManifest = {
    profile: 'product-admin',
    sourceRoots: ['src'],
    globalStylesheet: 'src/global.css',
    locale: 'en',
    designContract: 'DESIGN.md',
    canonicalMap: 'UX-CONTRACT.md',
    approvedConcept: 'design/concept.png',
    requiredCapabilities: ['Scrollbar'],
    ownership: {},
    requiredCommands: ['unit', 'browser', 'accessibility', 'visual'],
    commands: {
        unit: 'npm run test:unit',
        browser: 'npm run test:e2e',
        accessibility: 'npm run test:a11y',
        visual: 'npm run test:visual',
    },
    evidence: {
        publicRoot: 'tests/public.spec.ts',
        notFound: 'tests/not-found.spec.ts',
        accessibility: 'tests/accessibility.spec.ts',
        visualRegression: 'tests/visual.spec.ts',
    },
    tokenMapping: {
        owner: 'DESIGN.md',
        runtime: 'src/tokens.css',
        map: {
            'colors.canvas': '--color-canvas',
            'typography.body.fontFamily': '--font-body',
            'rounded.control': '--radius-control',
            'spacing.page-max': '--page-max',
        },
    },
    componentMapping: {
        'components.link.textColor': {
            reference: 'colors.canvas',
            consumers: ['src/link.css'],
        },
    },
}

async function createFixture() {
    const root = await mkdtemp(path.join(temporaryRoot, 'premium-ui-audit-'))
    await Promise.all([
        mkdir(path.join(root, 'design'), { recursive: true }),
        mkdir(path.join(root, 'src'), { recursive: true }),
        mkdir(path.join(root, 'tests'), { recursive: true }),
    ])
    await Promise.all([
        writeFile(path.join(root, 'DESIGN.md'), validDesign),
        writeFile(path.join(root, 'UX-CONTRACT.md'), validUxContract),
        writeFile(path.join(root, 'premium-ui.json'), `${JSON.stringify(validManifest, null, 2)}\n`),
        writeFile(path.join(root, 'design', 'concept.png'), 'fixture'),
        writeFile(
            path.join(root, 'src', 'tokens.css'),
            `:root {
    --color-canvas: #F4F0E8;
    --font-body: Arial, Helvetica, sans-serif;
    --radius-control: 0.125rem;
    --page-max: 90rem;
}
`,
        ),
        writeFile(
            path.join(root, 'src', 'global.css'),
            `html {
    scrollbar-color: var(--color-canvas) var(--color-canvas);
    scrollbar-width: thin;
}
*::-webkit-scrollbar { width: 0.75rem; }
*::-webkit-scrollbar-track { background: var(--color-canvas); }
*::-webkit-scrollbar-thumb { background: var(--color-canvas); }
*::-webkit-scrollbar-thumb:hover { background: var(--color-canvas); }
*::-webkit-scrollbar-thumb:active { background: var(--color-canvas); }
`,
        ),
        writeFile(path.join(root, 'src', 'link.css'), '.link { color: var(--color-canvas); }\n'),
        ...Object.values(validManifest.evidence).map(file => writeFile(path.join(root, file), 'export {}\n')),
    ])
    return root
}

test('a complete product contract passes strict static audit', async () => {
    const root = await createFixture()
    try {
        const result = await auditProject(root, { mode: 'strict' })
        assert.deepEqual(result.findings, [])
        assert.equal(result.summary.total, 0)
        assert.equal(exitCodeFor(result), 0)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('parsers expose Design.md token paths and complete canonical rows', () => {
    const design = parseDesignFrontmatter(validDesign)
    assert.equal(design.error, null)
    assert.equal(design.scalars.get('typography.body.fontFamily'), 'Arial, Helvetica, sans-serif')
    assert.equal(design.scalars.get('colors.canvas'), '#F4F0E8')

    const canonical = parseCanonicalMap(validUxContract)
    assert.equal(canonical.found, true)
    assert.deepEqual(canonical.rows.get('Scrollbar'), [
        'Scrollbar',
        'Global application stylesheet',
        'DESIGN.md',
        'Geometry exceptions',
        'Browser computed style',
    ])
    assert.equal(
        parseCanonicalMap('| Capability | Canonical owner | Source of truth | Allowed variants |\n').found,
        false,
    )
})

test('strict audit rejects an empty component token map', async () => {
    const root = await createFixture()
    try {
        await writeFile(
            path.join(root, 'DESIGN.md'),
            validDesign.replace('  link:\n    textColor: "{colors.canvas}"', '  link: {}'),
        )

        const result = await auditProject(root, { mode: 'strict' })
        assert.ok(result.findings.some(item => item.ruleId === 'design.component-empty'))
        assert.equal(exitCodeFor(result), 2)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('strict audit rejects unresolved ownership and token drift', async () => {
    const root = await createFixture()
    try {
        await writeFile(path.join(root, 'UX-CONTRACT.md'), validUxContract.replace('Global application stylesheet', ''))
        await writeFile(
            path.join(root, 'src', 'tokens.css'),
            `:root {
    --color-canvas: #FFFFFF;
    --font-body: Arial, Helvetica, sans-serif;
    --radius-control: 0.125rem;
    --page-max: 90rem;
}
`,
        )

        const result = await auditProject(root, { mode: 'strict' })
        const ruleIds = new Set(result.findings.map(item => item.ruleId))
        assert.ok(ruleIds.has('canonical.owner-unresolved'))
        assert.ok(ruleIds.has('tokens.value-drift'))
        assert.equal(exitCodeFor(result), 2)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('strict audit rejects unmapped primitive and runtime tokens', async () => {
    const root = await createFixture()
    try {
        await writeFile(
            path.join(root, 'DESIGN.md'),
            validDesign.replace('  page-max: "90rem"', '  page-max: "90rem"\n  section-gap: "5rem"'),
        )
        await writeFile(
            path.join(root, 'src', 'tokens.css'),
            `:root {
    --color-canvas: #F4F0E8;
    --font-body: Arial, Helvetica, sans-serif;
    --radius-control: 0.125rem;
    --page-max: 90rem;
    --motion-fast: 140ms;
}
`,
        )

        const result = await auditProject(root, { mode: 'strict' })
        const ruleIds = new Set(result.findings.map(item => item.ruleId))
        assert.ok(ruleIds.has('tokens.design-value-unmapped'))
        assert.ok(ruleIds.has('tokens.runtime-value-unmapped'))
        assert.equal(exitCodeFor(result), 2)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('strict audit rejects component literals, reference drift, and missing consumer mappings', async () => {
    const root = await createFixture()
    try {
        await writeFile(
            path.join(root, 'DESIGN.md'),
            validDesign.replace('textColor: "{colors.canvas}"', 'textColor: "4rem"'),
        )
        const literalResult = await auditProject(root, { mode: 'strict' })
        assert.ok(literalResult.findings.some(item => item.ruleId === 'components.reference-invalid'))
        assert.equal(exitCodeFor(literalResult), 2)

        await writeFile(
            path.join(root, 'DESIGN.md'),
            validDesign.replace('{colors.canvas}', '{spacing.page-max}'),
        )
        const referenceResult = await auditProject(root, { mode: 'strict' })
        assert.ok(referenceResult.findings.some(item => item.ruleId === 'components.reference-drift'))
        assert.equal(exitCodeFor(referenceResult), 2)

        await writeFile(path.join(root, 'DESIGN.md'), validDesign)
        await writeFile(path.join(root, 'src', 'link.css'), '.link { color: inherit; }\n')
        const consumerResult = await auditProject(root, { mode: 'strict' })
        assert.ok(consumerResult.findings.some(item => item.ruleId === 'components.consumer-token-missing'))
        assert.equal(exitCodeFor(consumerResult), 1)

        await writeFile(path.join(root, 'src', 'link.css'), '.link { color: var(--color-canvas); }\n')
        const manifest = structuredClone(validManifest)
        manifest.componentMapping = {}
        await writeFile(path.join(root, 'premium-ui.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        const missingMappingResult = await auditProject(root, { mode: 'strict' })
        assert.ok(missingMappingResult.findings.some(item => item.ruleId === 'components.mapping-entry-missing'))
        assert.equal(exitCodeFor(missingMappingResult), 2)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('source inspection rejects raw component colors outside the token adapter', async () => {
    const root = await createFixture()
    try {
        await writeFile(path.join(root, 'src', 'page.css'), '.page { color: #132A2E; }\n')

        const result = await auditProject(root, { mode: 'strict' })
        assert.ok(result.findings.some(item => item.ruleId === 'tokens.raw-color-outside-adapter'))
        assert.equal(exitCodeFor(result), 1)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('scrollbar checks require a document baseline and every global WebKit state', async () => {
    const root = await createFixture()
    try {
        await writeFile(
            path.join(root, 'src', 'global.css'),
            `html { color: var(--color-canvas); }
.panel {
    scrollbar-color: var(--color-canvas) var(--color-canvas);
    scrollbar-width: thin;
}
*::-scrollbar { width: 0.75rem; }
`,
        )

        const result = await auditProject(root, { mode: 'strict' })
        const ruleIds = new Set(result.findings.map(item => item.ruleId))
        assert.ok(ruleIds.has('scrollbar.standards-missing'))
        assert.ok(ruleIds.has('scrollbar.engine-fallback-missing'))
        assert.equal(exitCodeFor(result), 1)

        await writeFile(
            path.join(root, 'src', 'global.css'),
            `html {
    scrollbar-color: var(--color-canvas) var(--color-canvas);
    scrollbar-width: thin;
}
.panel::-webkit-scrollbar { width: 0.75rem; }
`,
        )
        const componentFallback = await auditProject(root, { mode: 'strict' })
        assert.ok(componentFallback.findings.some(item => item.ruleId === 'scrollbar.engine-fallback-missing'))
        assert.ok(!componentFallback.findings.some(item => item.ruleId === 'scrollbar.standards-missing'))

        await writeFile(
            path.join(root, 'src', 'global.css'),
            `html {
    scrollbar-color: var(--color-canvas) var(--color-canvas);
    scrollbar-width: thin;
}
*::-webkit-scrollbar { width: 0.75rem; }
`,
        )
        const baseOnlyFallback = await auditProject(root, { mode: 'strict' })
        const fallbackFinding = baseOnlyFallback.findings.find(
            item => item.ruleId === 'scrollbar.engine-fallback-missing',
        )
        assert.match(fallbackFinding.message, /track, thumb, thumb hover, thumb active/u)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('manifest rejects capabilities that the project audit does not implement', async () => {
    const root = await createFixture()
    try {
        const manifest = structuredClone(validManifest)
        manifest.requiredCapabilities = ['Form']
        await writeFile(path.join(root, 'premium-ui.json'), `${JSON.stringify(manifest, null, 2)}\n`)

        const result = await auditProject(root, { mode: 'strict' })
        assert.ok(result.findings.some(item => item.ruleId === 'config.capability-invalid'))
        assert.equal(exitCodeFor(result), 2)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('source inspection reports false affordances and nonsemantic interaction', async () => {
    const root = await createFixture()
    try {
        await writeFile(
            path.join(root, 'src', 'page.tsx'),
            `export function Page() {
    return <><a href="#">Broken</a><div onClick={() => alert('broken')}>Open</div></>
}
`,
        )

        const result = await auditProject(root, { mode: 'strict' })
        const ruleIds = new Set(result.findings.map(item => item.ruleId))
        assert.ok(ruleIds.has('affordance.empty-href'))
        assert.ok(ruleIds.has('interaction.native-dialog'))
        assert.ok(ruleIds.has('interaction.nonsemantic-click'))
        assert.equal(exitCodeFor(result), 1)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('manifest paths cannot escape the project and report mode preserves findings', async () => {
    const root = await createFixture()
    try {
        const manifest = structuredClone(validManifest)
        manifest.sourceRoots = ['../outside']
        await writeFile(path.join(root, 'premium-ui.json'), `${JSON.stringify(manifest, null, 2)}\n`)

        const strictResult = await auditProject(root, { mode: 'strict' })
        assert.ok(strictResult.findings.some(item => item.ruleId === 'config.source-root-invalid'))
        assert.equal(exitCodeFor(strictResult), 2)

        const reportResult = await auditProject(root, { mode: 'report' })
        assert.ok(reportResult.summary.total > 0)
        assert.equal(exitCodeFor(reportResult), 0)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('CLI arguments default to strict mode and reject ambiguous input', () => {
    assert.deepEqual(parseArguments(['--mode', 'report', '--no-write', '.'], '/workspace'), {
        projectRoot: '/workspace',
        mode: 'report',
        configPath: null,
        outputPath: null,
        noWrite: true,
    })
    assert.throws(() => parseArguments(['--mode', 'unknown']), /report or strict/u)
    assert.throws(() => parseArguments(['one', 'two']), /Unexpected positional argument/u)
})
