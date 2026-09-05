#!/usr/bin/env node

import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const SCHEMA_VERSION = 1
const DEFAULT_CONFIG = 'premium-ui.json'
const DEFAULT_OUTPUT = 'premium-audit.json'
const DESIGN_SECTIONS = [
    'Overview',
    'Colors',
    'Typography',
    'Layout',
    'Elevation & Depth',
    'Shapes',
    'Components',
    "Do's and Don'ts",
]
const MAP_COLUMNS = ['Capability', 'Canonical owner', 'Source of truth', 'Allowed variants', 'Verification']
const KNOWN_CAPABILITIES = new Set(['Scrollbar'])
const REQUIRED_COMMANDS = ['unit', 'browser', 'accessibility', 'visual']
const REQUIRED_EVIDENCE = ['publicRoot', 'notFound', 'accessibility', 'visualRegression']
const PRIMITIVE_TOKEN_GROUPS = new Set(['colors', 'rounded', 'spacing', 'typography'])
const REQUIRED_WEBKIT_SCROLLBAR_STATES = new Map([
    ['base', /^(?:\*|html)::-webkit-scrollbar$/iu],
    ['track', /^(?:\*|html)::-webkit-scrollbar-track$/iu],
    ['thumb', /^(?:\*|html)::-webkit-scrollbar-thumb$/iu],
    ['thumb hover', /^(?:\*|html)::-webkit-scrollbar-thumb:hover$/iu],
    ['thumb active', /^(?:\*|html)::-webkit-scrollbar-thumb:active$/iu],
])
const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.scss', '.ts', '.tsx'])
const IGNORED_DIRECTORIES = new Set([
    '.git',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
])

function finding(
    ruleId,
    message,
    remediation,
    { file = DEFAULT_CONFIG, line = null, severity = 'error', category = 'violation' } = {},
) {
    return { file, line, ruleId, severity, category, message, remediation }
}

function relativePath(projectRoot, target) {
    const relative = path.relative(projectRoot, target)
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? relative.split(path.sep).join('/')
        : target
}

function lineNumber(source, offset) {
    return source.slice(0, offset).split('\n').length
}

function containedPath(projectRoot, configuredPath) {
    if (typeof configuredPath !== 'string' || configuredPath.trim() === '' || path.isAbsolute(configuredPath)) {
        return null
    }

    const resolved = path.resolve(projectRoot, configuredPath)
    const relative = path.relative(projectRoot, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null
    }
    return resolved
}

async function isRealPathContained(projectRoot, target) {
    try {
        const [realRoot, realTarget] = await Promise.all([realpath(projectRoot), realpath(target)])
        const relative = path.relative(realRoot, realTarget)
        return !relative.startsWith('..') && !path.isAbsolute(relative)
    } catch {
        return false
    }
}

async function readUtf8(file) {
    const bytes = await readFile(file)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

async function fileKind(file) {
    try {
        const value = await stat(file)
        if (value.isFile()) return 'file'
        if (value.isDirectory()) return 'directory'
        return 'other'
    } catch {
        return 'missing'
    }
}

function parseScalar(rawValue) {
    const value = rawValue.trim()
    if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
        return value.slice(1, -1)
    }
    return value
}

export function parseDesignFrontmatter(source) {
    const normalized = source.replaceAll('\r\n', '\n')
    if (!normalized.startsWith('---\n')) {
        return { scalars: new Map(), maps: new Set(), emptyMaps: new Set(), error: 'Missing opening YAML fence.' }
    }

    const closingFence = normalized.indexOf('\n---\n', 4)
    if (closingFence === -1) {
        return { scalars: new Map(), maps: new Set(), emptyMaps: new Set(), error: 'Missing closing YAML fence.' }
    }

    const frontmatter = normalized.slice(4, closingFence)
    const scalars = new Map()
    const maps = new Set()
    const emptyMaps = new Set()
    const stack = [{ indent: -1, parts: [] }]

    for (const rawLine of frontmatter.split('\n')) {
        if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
        if (rawLine.includes('\t')) {
            return { scalars, maps, emptyMaps, error: 'YAML frontmatter must use spaces for indentation.' }
        }

        const match = /^(\s*)([^:#][^:]*):(?:\s*(.*))?$/u.exec(rawLine)
        if (!match) {
            return { scalars, maps, emptyMaps, error: `Unsupported frontmatter line: ${rawLine.trim()}` }
        }

        const indent = match[1].length
        const key = match[2].trim()
        const rawValue = match[3] ?? ''
        while (stack.at(-1).indent >= indent) stack.pop()
        const parts = [...stack.at(-1).parts, key]
        const tokenPath = parts.join('.')
        maps.add(tokenPath)

        if (rawValue === '') {
            stack.push({ indent, parts })
        } else if (rawValue.trim() === '{}') {
            emptyMaps.add(tokenPath)
        } else {
            scalars.set(tokenPath, parseScalar(rawValue))
        }
    }

    return { scalars, maps, emptyMaps, error: null }
}

function inspectDesignContract(source, manifest, file) {
    const findings = []
    const parsed = parseDesignFrontmatter(source)
    if (parsed.error) {
        findings.push(
            finding('design.frontmatter-invalid', parsed.error, 'Use valid Design.md alpha YAML frontmatter.', {
                file,
                category: 'unresolved',
            }),
        )
        return { findings, parsed }
    }

    if (parsed.scalars.get('version') !== 'alpha') {
        findings.push(
            finding(
                'design.version-invalid',
                'The design contract does not declare version: alpha.',
                'Set the frontmatter version to alpha and run the official Design.md linter.',
                { file, category: 'unresolved' },
            ),
        )
    }

    for (const field of ['name', 'description']) {
        if (!parsed.scalars.get(field)) {
            findings.push(
                finding(
                    `design.${field}-missing`,
                    `The design contract has no nonempty ${field}.`,
                    `Add a concrete ${field} to the Design.md frontmatter.`,
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    for (const group of ['colors', 'typography', 'rounded', 'spacing', 'components']) {
        const hasChild = [...parsed.maps].some(value => value.startsWith(`${group}.`))
        if (!parsed.maps.has(group) || !hasChild || parsed.emptyMaps.has(group)) {
            findings.push(
                finding(
                    'design.token-group-empty',
                    `The ${group} token group is missing or empty.`,
                    `Define concrete ${group} entries; do not use an empty token map.`,
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    for (const [tokenPath, value] of parsed.scalars) {
        if (tokenPath.split('.').length === 2 && tokenPath.startsWith('colors.') && !isCssColor(value)) {
            findings.push(
                finding(
                    'design.color-invalid',
                    `${tokenPath} is not a supported concrete CSS color.`,
                    'Use a hex, rgb, hsl, or oklch color value.',
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    const typographyRoles = [...parsed.maps]
        .filter(value => /^typography\.[^.]+$/u.test(value))
        .map(value => value.slice('typography.'.length))
    for (const role of typographyRoles) {
        if (!parsed.scalars.get(`typography.${role}.fontFamily`)) {
            findings.push(
                finding(
                    'design.typography-family-missing',
                    `Typography role ${role} has no fontFamily.`,
                    'Represent every typography role as an object with a concrete fontFamily.',
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    const componentNames = [...parsed.maps]
        .filter(value => /^components\.[^.]+$/u.test(value))
        .map(value => value.slice('components.'.length))
    for (const component of componentNames) {
        const componentPath = `components.${component}`
        const tokenPrefix = `${componentPath}.`
        if (parsed.emptyMaps.has(componentPath) || ![...parsed.scalars].some(([key]) => key.startsWith(tokenPrefix))) {
            findings.push(
                finding(
                    'design.component-empty',
                    `Component ${component} has no concrete visual tokens.`,
                    'Define at least one recognized, concrete component sub-token or remove the empty component.',
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    const headings = [...source.matchAll(/^## (.+)$/gmu)].map(match => match[1].trim())
    let previousIndex = -1
    for (const section of DESIGN_SECTIONS) {
        const matches = headings.reduce((count, heading) => count + Number(heading === section), 0)
        const index = headings.indexOf(section)
        if (matches !== 1 || index <= previousIndex) {
            findings.push(
                finding(
                    'design.section-order-invalid',
                    `Design section ${section} is missing, duplicated, or out of canonical order.`,
                    `Keep one ${section} H2 in the canonical Design.md section order.`,
                    { file, category: 'unresolved' },
                ),
            )
        }
        if (index !== -1) previousIndex = index
    }

    if (typeof manifest.approvedConcept === 'string' && !source.includes(manifest.approvedConcept)) {
        findings.push(
            finding(
                'design.reference-missing',
                'The design contract does not name the approved concept artifact.',
                'Link the approvedConcept path from the Design.md overview.',
                { file, category: 'unresolved' },
            ),
        )
    }

    return { findings, parsed }
}

function isCssColor(value) {
    return (
        /^#[\da-f]{3,8}$/iu.test(value) ||
        /^(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color|color-mix)\([^\n]+\)$/iu.test(value) ||
        /^(?:black|white|transparent|currentColor)$/iu.test(value)
    )
}

export function parseCanonicalMap(source) {
    const lines = source.replaceAll('\r\n', '\n').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
        const cells = tableCells(lines[index])
        if (
            !cells ||
            cells.length !== MAP_COLUMNS.length ||
            !cells.every((cell, cellIndex) => cell === MAP_COLUMNS[cellIndex])
        ) {
            continue
        }

        const rows = new Map()
        const duplicates = new Set()
        for (const rawLine of lines.slice(index + 2)) {
            const row = tableCells(rawLine)
            if (!row) break
            if (row.length !== MAP_COLUMNS.length || !KNOWN_CAPABILITIES.has(row[0])) continue
            if (rows.has(row[0])) duplicates.add(row[0])
            rows.set(row[0], row)
        }
        return { found: true, rows, duplicates }
    }
    return { found: false, rows: new Map(), duplicates: new Set() }
}

function tableCells(line) {
    if (!line.trim().startsWith('|')) return null
    const trimmed = line.trim()
    const body = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1)
    return body.split('|').map(cell => cell.trim())
}

function inspectCanonicalMap(source, manifest, file) {
    const findings = []
    const canonicalMap = parseCanonicalMap(source)
    if (!canonicalMap.found) {
        findings.push(
            finding(
                'canonical.map-missing',
                'The UX contract has no Canonical UI Map with the exact five required columns.',
                `Add this header: ${MAP_COLUMNS.join(' | ')}.`,
                { file, category: 'unresolved' },
            ),
        )
        return findings
    }

    for (const capability of canonicalMap.duplicates) {
        findings.push(
            finding(
                'canonical.owner-duplicate',
                `Canonical ownership is declared more than once for ${capability}.`,
                'Keep one complete row for each applicable capability.',
                { file, category: 'unresolved' },
            ),
        )
    }

    const requiredCapabilities = Array.isArray(manifest.requiredCapabilities) ? manifest.requiredCapabilities : []
    for (const capability of requiredCapabilities) {
        const row = canonicalMap.rows.get(capability)
        if (!row || row.some(cell => cell === '')) {
            findings.push(
                finding(
                    'canonical.owner-unresolved',
                    `Canonical ownership is unresolved for ${capability}.`,
                    `Add one complete ${capability} row to the Canonical UI Map before implementation.`,
                    { file, category: 'unresolved' },
                ),
            )
        }
    }

    return findings
}

function normalizeTokenValue(value) {
    const normalized = String(value)
        .trim()
        .replace(/\s+/gu, ' ')
        .replace(/\s*,\s*/gu, ', ')
    if (/^0(?:\.0+)?(?:[a-z%]+)?$/iu.test(normalized)) return '0'
    return normalized.toLowerCase()
}

function cssCustomProperties(source) {
    const properties = new Map()
    const duplicates = new Set()
    for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/gu)) {
        if (properties.has(match[1])) duplicates.add(match[1])
        properties.set(match[1], match[2].trim())
    }
    return { properties, duplicates }
}

function cssWithoutComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//gu, '')
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

async function inspectComponentMapping(projectRoot, manifest, designData, tokenMap) {
    const findings = []
    if (!designData) return findings

    const componentValues = new Map(
        [...designData.scalars].filter(([designPath]) => designPath.startsWith('components.')),
    )
    const mapping = manifest.componentMapping
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        return [
            finding(
                'components.mapping-missing',
                'The manifest has no componentMapping object for normative component values.',
                'Map every component value to the project-owned CSS files that consume its referenced primitive.',
                { category: 'unresolved' },
            ),
        ]
    }

    for (const designPath of Object.keys(mapping)) {
        if (!componentValues.has(designPath)) {
            findings.push(
                finding(
                    'components.mapping-stale',
                    `Component mapping ${designPath} has no matching scalar in the design contract.`,
                    'Remove the stale entry or restore the normative component value in Design.md.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }
    }

    for (const [designPath, designValue] of componentValues) {
        const referenceMatch = /^\{([^{}]+)\}$/u.exec(designValue)
        const primitivePath = referenceMatch?.[1]
        const primitiveGroup = primitivePath?.split('.')[0]
        const isPrimitiveReference =
            primitivePath && PRIMITIVE_TOKEN_GROUPS.has(primitiveGroup) && designData.scalars.has(primitivePath)

        if (!isPrimitiveReference) {
            findings.push(
                finding(
                    'components.reference-invalid',
                    `${designPath} must reference one concrete primitive design token; received ${designValue}.`,
                    'Move durable scalar values into a primitive token group and reference them with {token.path}.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }

        const mappingEntry = mapping[designPath]
        if (!mappingEntry || typeof mappingEntry !== 'object' || Array.isArray(mappingEntry)) {
            findings.push(
                finding(
                    'components.mapping-entry-missing',
                    `${designPath} has no component mapping entry.`,
                    'Declare its exact primitive reference and at least one project-owned CSS consumer.',
                    { category: 'unresolved' },
                ),
            )
            continue
        }

        const declaredReference = mappingEntry.reference
        const declaredGroup = typeof declaredReference === 'string' ? declaredReference.split('.')[0] : null
        const declaredReferenceIsPrimitive =
            typeof declaredReference === 'string' &&
            PRIMITIVE_TOKEN_GROUPS.has(declaredGroup) &&
            designData.scalars.has(declaredReference)
        if (!declaredReferenceIsPrimitive) {
            findings.push(
                finding(
                    'components.mapping-reference-invalid',
                    `${designPath} has no valid primitive reference in its component mapping.`,
                    'Set reference to one concrete primitive token path from Design.md.',
                    { category: 'unresolved' },
                ),
            )
        } else if (primitivePath !== declaredReference) {
            findings.push(
                finding(
                    'components.reference-drift',
                    `${designPath} references ${primitivePath ?? designValue}, but its component mapping references ${declaredReference}.`,
                    'Update the design contract, mapping, runtime token, and CSS consumer together.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }

        const consumers = mappingEntry.consumers
        if (!Array.isArray(consumers) || consumers.length === 0) {
            findings.push(
                finding(
                    'components.consumer-missing',
                    `${designPath} has no declared CSS consumer.`,
                    'List at least one project-owned CSS file that consumes the referenced runtime custom property.',
                    { category: 'unresolved' },
                ),
            )
            continue
        }

        const uniqueConsumers = new Set(consumers)
        if (uniqueConsumers.size !== consumers.length || [...uniqueConsumers].some(value => typeof value !== 'string')) {
            findings.push(
                finding(
                    'components.consumer-invalid',
                    `${designPath} has a duplicated or non-string CSS consumer.`,
                    'List each project-relative CSS consumer exactly once.',
                    { category: 'unresolved' },
                ),
            )
        }

        const customProperty = declaredReferenceIsPrimitive ? tokenMap[declaredReference] : null
        if (declaredReferenceIsPrimitive && !customProperty) {
            findings.push(
                finding(
                    'components.reference-unmapped',
                    `${designPath} maps to ${declaredReference}, which has no runtime token mapping.`,
                    'Map the referenced primitive to its CSS custom property before using it in a component contract.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }

        if (typeof customProperty !== 'string' || !/^--[\w-]+$/u.test(customProperty)) continue
        const propertyUse = new RegExp(`var\\s*\\(\\s*${escapeRegExp(customProperty)}(?:\\s*,[^)]*)?\\s*\\)`, 'u')

        for (const configuredPath of uniqueConsumers) {
            if (typeof configuredPath !== 'string') continue
            const inspected = await inspectDeclaredFile(projectRoot, configuredPath, {
                ruleId: 'components.consumer-missing',
                label: `${designPath} consumer`,
            })
            if (inspected.finding) {
                findings.push(inspected.finding)
                continue
            }
            if (!['.css', '.scss'].includes(path.extname(inspected.target).toLowerCase())) {
                findings.push(
                    finding(
                        'components.consumer-invalid',
                        `${designPath} consumer is not a CSS stylesheet.`,
                        'Point componentMapping entries to project-owned CSS or SCSS files.',
                        { file: configuredPath, category: 'unresolved' },
                    ),
                )
                continue
            }

            let source
            try {
                source = await readUtf8(inspected.target)
            } catch (error) {
                findings.push(
                    finding(
                        'components.consumer-unreadable',
                        `${designPath} consumer is not readable UTF-8: ${error.message}`,
                        'Use a readable UTF-8 component stylesheet.',
                        { file: configuredPath, category: 'unresolved' },
                    ),
                )
                continue
            }
            if (!propertyUse.test(cssWithoutComments(source))) {
                findings.push(
                    finding(
                        'components.consumer-token-missing',
                        `${designPath} declares ${configuredPath}, but that file does not consume ${customProperty}.`,
                        `Use var(${customProperty}) in the declared consumer or update the component mapping.`,
                        { file: configuredPath },
                    ),
                )
            }
        }
    }

    return findings
}

async function inspectTokenMapping(projectRoot, manifest, designData) {
    const findings = []
    const mapping = manifest.tokenMapping
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        return [
            finding(
                'tokens.mapping-missing',
                'The manifest has no tokenMapping object.',
                'Declare the Design.md owner, runtime CSS adapter, and path-to-property map.',
                { category: 'unresolved' },
            ),
        ]
    }

    if (mapping.owner !== manifest.designContract) {
        findings.push(
            finding(
                'tokens.owner-invalid',
                'The token mapping owner differs from the configured design contract.',
                'Use one normative token owner and point tokenMapping.owner to it.',
                { category: 'unresolved' },
            ),
        )
    }

    const runtimePath = containedPath(projectRoot, mapping.runtime)
    if (
        !runtimePath ||
        (await fileKind(runtimePath)) !== 'file' ||
        !(await isRealPathContained(projectRoot, runtimePath))
    ) {
        findings.push(
            finding(
                'tokens.runtime-missing',
                'The configured runtime token adapter is missing, unreadable, or outside the project.',
                'Point tokenMapping.runtime to a project-owned CSS token file.',
                {
                    file: typeof mapping.runtime === 'string' ? mapping.runtime : DEFAULT_CONFIG,
                    category: 'unresolved',
                },
            ),
        )
        return findings
    }

    let runtimeSource
    try {
        runtimeSource = await readUtf8(runtimePath)
    } catch (error) {
        findings.push(
            finding(
                'tokens.runtime-unreadable',
                `The runtime token adapter is not readable UTF-8: ${error.message}`,
                'Use a readable UTF-8 CSS token file.',
                { file: relativePath(projectRoot, runtimePath), category: 'unresolved' },
            ),
        )
        return findings
    }

    const tokenMap = mapping.map
    if (!tokenMap || typeof tokenMap !== 'object' || Array.isArray(tokenMap) || Object.keys(tokenMap).length === 0) {
        findings.push(
            finding(
                'tokens.map-empty',
                'The token mapping has no durable token entries.',
                'Map every durable Design.md token used by the changed surface to one CSS custom property.',
                { category: 'unresolved' },
            ),
        )
        return findings
    }

    const runtime = cssCustomProperties(runtimeSource)
    for (const customProperty of runtime.duplicates) {
        if (Object.values(tokenMap).includes(customProperty)) {
            findings.push(
                finding(
                    'tokens.runtime-duplicate',
                    `Mapped runtime property ${customProperty} is declared more than once in the token adapter.`,
                    'Keep one declaration in the canonical adapter and derive variants from semantic aliases.',
                    { file: relativePath(projectRoot, runtimePath) },
                ),
            )
        }
    }

    const mappedDesignPaths = new Set(Object.keys(tokenMap))
    for (const designPath of designData?.scalars.keys() ?? []) {
        const [group] = designPath.split('.')
        if (PRIMITIVE_TOKEN_GROUPS.has(group) && !mappedDesignPaths.has(designPath)) {
            findings.push(
                finding(
                    'tokens.design-value-unmapped',
                    `Primitive design token ${designPath} has no runtime mapping.`,
                    'Map every primitive color, typography, rounded, and spacing token to its runtime custom property.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }
    }

    const mappedRuntimeProperties = new Set(Object.values(tokenMap))
    for (const customProperty of runtime.properties.keys()) {
        if (!mappedRuntimeProperties.has(customProperty)) {
            findings.push(
                finding(
                    'tokens.runtime-value-unmapped',
                    `Runtime property ${customProperty} has no durable design-token mapping.`,
                    'Map the property to its primitive Design.md token or remove the unused runtime alias.',
                    { file: relativePath(projectRoot, runtimePath), category: 'unresolved' },
                ),
            )
        }
    }

    for (const [designPath, customProperty] of Object.entries(tokenMap)) {
        if (typeof customProperty !== 'string' || !/^--[\w-]+$/u.test(customProperty)) {
            findings.push(
                finding(
                    'tokens.property-invalid',
                    `${designPath} does not map to a valid CSS custom property.`,
                    'Use a custom property name beginning with --.',
                    { category: 'unresolved' },
                ),
            )
            continue
        }

        const designValue = designData?.scalars.get(designPath)
        const runtimeValue = runtime.properties.get(customProperty)
        if (!designValue) {
            findings.push(
                finding(
                    'tokens.design-value-missing',
                    `Mapped design token ${designPath} is missing or non-scalar.`,
                    'Add a concrete scalar value to Design.md or remove the stale mapping.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        } else if (!runtimeValue) {
            findings.push(
                finding(
                    'tokens.runtime-value-missing',
                    `Mapped runtime property ${customProperty} is missing.`,
                    `Declare ${customProperty} in ${mapping.runtime}.`,
                    { file: relativePath(projectRoot, runtimePath) },
                ),
            )
        } else if (normalizeTokenValue(designValue) !== normalizeTokenValue(runtimeValue)) {
            findings.push(
                finding(
                    'tokens.value-drift',
                    `${designPath} (${designValue}) differs from ${customProperty} (${runtimeValue}).`,
                    'Change the normative design token once and update its direct runtime adapter in the same change.',
                    { file: relativePath(projectRoot, runtimePath) },
                ),
            )
        }
    }

    findings.push(...(await inspectComponentMapping(projectRoot, manifest, designData, tokenMap)))

    return findings
}

async function inspectDeclaredFile(projectRoot, configuredPath, { ruleId, label, expectedKind = 'file' }) {
    const target = containedPath(projectRoot, configuredPath)
    if (!target) {
        return {
            target: null,
            finding: finding(
                ruleId,
                `${label} must be a project-relative path.`,
                `Point ${label} inside the repository.`,
                {
                    category: 'unresolved',
                },
            ),
        }
    }

    const kind = await fileKind(target)
    if (kind !== expectedKind || !(await isRealPathContained(projectRoot, target))) {
        return {
            target,
            finding: finding(
                ruleId,
                `${label} is missing, has the wrong type, or resolves outside the project.`,
                `Point ${label} to an existing project-owned ${expectedKind}.`,
                { file: configuredPath, category: 'unresolved' },
            ),
        }
    }

    return { target, finding: null }
}

async function inspectManifest(projectRoot, manifest) {
    const findings = []
    if (manifest.profile !== 'product-admin') {
        findings.push(
            finding(
                'config.profile-invalid',
                'This product foundation must use the product-admin audit profile.',
                'Set profile to product-admin so durable contract checks cannot be skipped.',
                { category: 'unresolved' },
            ),
        )
    }
    if (typeof manifest.locale !== 'string' || manifest.locale.trim() === '') {
        findings.push(
            finding(
                'config.locale-missing',
                'The active locale is missing.',
                'Set locale to the active BCP 47 locale.',
                {
                    category: 'unresolved',
                },
            ),
        )
    }

    if (!Array.isArray(manifest.sourceRoots) || manifest.sourceRoots.length === 0) {
        findings.push(
            finding(
                'config.source-roots-missing',
                'The manifest declares no frontend source root.',
                'Add at least one project-relative sourceRoots directory.',
                { category: 'unresolved' },
            ),
        )
    }

    if (!Array.isArray(manifest.requiredCapabilities)) {
        findings.push(
            finding(
                'config.capabilities-invalid',
                'requiredCapabilities must be an array.',
                'List only applicable canonical capability names.',
                { category: 'unresolved' },
            ),
        )
    } else {
        const seen = new Set()
        for (const capability of manifest.requiredCapabilities) {
            if (!KNOWN_CAPABILITIES.has(capability) || seen.has(capability)) {
                findings.push(
                    finding(
                        'config.capability-invalid',
                        `Required capability is unknown or duplicated: ${String(capability)}.`,
                        'Use each supported capability name at most once.',
                        { category: 'unresolved' },
                    ),
                )
            }
            seen.add(capability)
        }
    }

    if (Array.isArray(manifest.requiredCapabilities) && manifest.requiredCapabilities.includes('Scrollbar')) {
        const inspected = await inspectDeclaredFile(projectRoot, manifest.globalStylesheet, {
            ruleId: 'scrollbar.global-stylesheet-missing',
            label: 'globalStylesheet',
        })
        if (inspected.finding) findings.push(inspected.finding)
    }

    if (!manifest.ownership || typeof manifest.ownership !== 'object' || Array.isArray(manifest.ownership)) {
        findings.push(
            finding(
                'config.ownership-invalid',
                'ownership must be an object, even when this slice has no native, typed, or authored control choice.',
                'Set ownership to an object and record applicable control ownership decisions there.',
                { category: 'unresolved' },
            ),
        )
    }

    const requiredCommands = Array.isArray(manifest.requiredCommands) ? manifest.requiredCommands : []
    const commands =
        manifest.commands && typeof manifest.commands === 'object' && !Array.isArray(manifest.commands)
            ? manifest.commands
            : {}
    for (const command of REQUIRED_COMMANDS) {
        if (!requiredCommands.includes(command)) {
            findings.push(
                finding(
                    'evidence.command-not-required',
                    `Runtime verification command is not required: ${command}.`,
                    `Add ${command} to requiredCommands.`,
                    { category: 'unresolved' },
                ),
            )
        }
    }
    for (const command of requiredCommands) {
        const value = commands[command]
        if (typeof value !== 'string' || value.trim() === '') {
            findings.push(
                finding(
                    'evidence.command-missing',
                    `Required runtime verification command is missing: ${String(command)}.`,
                    `Configure commands.${String(command)} and run it separately.`,
                    { category: 'unresolved' },
                ),
            )
        } else if (/(?:^|\s)(?:[A-Za-z]:[\\/]|\/(?:home|Users)\/)|\.codex[\\/](?:plugins|skills|cache)/u.test(value)) {
            findings.push(
                finding(
                    'evidence.command-not-portable',
                    `Runtime verification command ${command} contains a workstation-specific path.`,
                    'Use repository scripts and project-relative paths only.',
                    { category: 'unresolved' },
                ),
            )
        }
    }

    const evidence =
        manifest.evidence && typeof manifest.evidence === 'object' && !Array.isArray(manifest.evidence)
            ? manifest.evidence
            : {}
    for (const key of REQUIRED_EVIDENCE) {
        if (!(key in evidence)) {
            findings.push(
                finding(
                    'evidence.path-missing',
                    `Required workflow evidence is undeclared: ${key}.`,
                    `Add evidence.${key} with a project-owned test or report path.`,
                    { category: 'unresolved' },
                ),
            )
        }
    }
    for (const [key, evidencePath] of Object.entries(evidence)) {
        const inspected = await inspectDeclaredFile(projectRoot, evidencePath, {
            ruleId: 'evidence.file-missing',
            label: `evidence.${key}`,
        })
        if (inspected.finding) findings.push(inspected.finding)
    }

    return findings
}

async function sourceFiles(root) {
    const files = []
    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
                await visit(path.join(directory, entry.name))
            } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                files.push(path.join(directory, entry.name))
            }
        }
    }
    await visit(root)
    return files
}

async function inspectSource(projectRoot, manifest) {
    const findings = []
    const cssSources = []
    for (const configuredRoot of Array.isArray(manifest.sourceRoots) ? manifest.sourceRoots : []) {
        const inspected = await inspectDeclaredFile(projectRoot, configuredRoot, {
            ruleId: 'config.source-root-invalid',
            label: `source root ${String(configuredRoot)}`,
            expectedKind: 'directory',
        })
        if (inspected.finding) {
            findings.push(inspected.finding)
            continue
        }

        let files
        try {
            files = await sourceFiles(inspected.target)
        } catch (error) {
            findings.push(
                finding(
                    'source.unreadable',
                    `Configured source root cannot be inspected: ${error.message}`,
                    'Make the source root readable and keep source files as UTF-8.',
                    { file: configuredRoot, category: 'unresolved' },
                ),
            )
            continue
        }

        for (const file of files) {
            let source
            try {
                source = await readUtf8(file)
            } catch (error) {
                findings.push(
                    finding(
                        'source.unreadable',
                        `Source file is not readable UTF-8: ${error.message}`,
                        'Convert the source to UTF-8 or remove it from the configured source root.',
                        { file: relativePath(projectRoot, file), category: 'unresolved' },
                    ),
                )
                continue
            }

            const name = relativePath(projectRoot, file)
            if (path.extname(file).toLowerCase() === '.css' || path.extname(file).toLowerCase() === '.scss') {
                cssSources.push({ name, source })
                if (name !== manifest.tokenMapping?.runtime) {
                    const rawColor = /#[\da-f]{3,8}\b|(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color-mix)\([^\n;{}]+\)/iu.exec(
                        source,
                    )
                    if (rawColor) {
                        findings.push(
                            finding(
                                'tokens.raw-color-outside-adapter',
                                'Component styling contains a raw color outside the runtime token adapter.',
                                'Declare the semantic color or shadow in the runtime adapter and consume its custom property.',
                                { file: name, line: lineNumber(source, rawColor.index) },
                            ),
                        )
                    }
                }
            }
            for (const check of sourceChecks()) {
                const match = check.pattern.exec(source)
                check.pattern.lastIndex = 0
                if (match) {
                    findings.push(
                        finding(check.ruleId, check.message, check.remediation, {
                            file: name,
                            line: lineNumber(source, match.index),
                        }),
                    )
                }
            }
        }
    }

    if (Array.isArray(manifest.requiredCapabilities) && manifest.requiredCapabilities.includes('Scrollbar')) {
        const globalStylesheet = cssSources.find(item => item.name === manifest.globalStylesheet)
        const globalSource = globalStylesheet?.source ?? ''
        const documentOwnsStandards = [...globalSource.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].some(match => {
            const selectors = match[1].split(',').map(selector => selector.trim())
            const declarations = match[2]
            return (
                selectors.includes('html') &&
                /scrollbar-color\s*:/iu.test(declarations) &&
                /scrollbar-width\s*:/iu.test(declarations)
            )
        })
        if (!documentOwnsStandards) {
            findings.push(
                finding(
                    'scrollbar.standards-missing',
                    'The global scrollbar baseline lacks scrollbar-color or scrollbar-width.',
                    'Define both standards-based properties on html in the configured global stylesheet.',
                    { file: manifest.globalStylesheet ?? String(manifest.sourceRoots?.[0] ?? DEFAULT_CONFIG) },
                ),
            )
        }
        const stylesheet = cssWithoutComments(globalSource)
        const selectors = [...stylesheet.matchAll(/([^{}]+)\{[^{}]*\}/gu)].flatMap(match =>
            match[1].split(',').map(selector => selector.trim()),
        )
        const missingWebkitStates = [...REQUIRED_WEBKIT_SCROLLBAR_STATES].flatMap(([state, pattern]) =>
            selectors.some(selector => pattern.test(selector)) ? [] : [state],
        )
        if (missingWebkitStates.length > 0) {
            findings.push(
                finding(
                    'scrollbar.engine-fallback-missing',
                    `The global scrollbar baseline lacks WebKit/Blink rules for: ${missingWebkitStates.join(', ')}.`,
                    'Add tokenized global base, track, thumb, thumb hover, and thumb active rules.',
                    { file: manifest.globalStylesheet ?? String(manifest.sourceRoots?.[0] ?? DEFAULT_CONFIG) },
                ),
            )
        }
        const optIn = cssSources.find(item =>
            /\.(?:custom-scrollbar|scrollbar|ui-scroll-container)\b[^,{]*::-(?:webkit-)?scrollbar/iu.test(item.source),
        )
        if (optIn) {
            findings.push(
                finding(
                    'scrollbar.opt-in-base',
                    'Base scrollbar styling depends on an opt-in utility class.',
                    'Apply the scrollbar baseline to the application document and inherit it globally.',
                    { file: optIn.name },
                ),
            )
        }
    }

    return findings
}

function sourceChecks() {
    return [
        {
            ruleId: 'affordance.empty-href',
            pattern: /href\s*=\s*["']#["']/giu,
            message: 'An empty hash link looks actionable but has no destination.',
            remediation: 'Use a real fragment, route, or semantic non-interactive element.',
        },
        {
            ruleId: 'interaction.native-dialog',
            pattern: /(?:window\.)?(?:alert|confirm|prompt)\s*\(/giu,
            message: 'Product code calls a browser-native dialog.',
            remediation: 'Use the app-owned accessible dialog owner when a later workflow needs one.',
        },
        {
            ruleId: 'interaction.nonsemantic-click',
            pattern: /<(?:div|span|p|section)\b[^>]*\bonClick\s*=/giu,
            message: 'A non-interactive element has a pointer click handler.',
            remediation: 'Use a native button for actions or a link for navigation.',
        },
        {
            ruleId: 'security.unsafe-html',
            pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=/giu,
            message: 'Source code contains a direct HTML injection surface.',
            remediation: 'Render structured content or use an explicitly reviewed safe renderer.',
        },
    ]
}

async function loadManifest(configPath) {
    try {
        const source = await readUtf8(configPath)
        const manifest = JSON.parse(source)
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            throw new TypeError('The top-level JSON value must be an object.')
        }
        return { manifest, findings: [] }
    } catch (error) {
        return {
            manifest: null,
            findings: [
                finding(
                    'config.invalid-json',
                    `Cannot read or parse the project manifest: ${error.message}`,
                    `Fix ${configPath} or pass --config with a readable JSON object.`,
                    { file: configPath, category: 'unresolved' },
                ),
            ],
        }
    }
}

function resultFor(mode, projectRoot, findings) {
    const ordered = [...findings].sort((left, right) =>
        [left.category, left.ruleId, left.file, left.line ?? 0, left.message]
            .join('\0')
            .localeCompare([right.category, right.ruleId, right.file, right.line ?? 0, right.message].join('\0')),
    )
    return {
        schemaVersion: SCHEMA_VERSION,
        mode,
        projectRoot,
        findings: ordered,
        summary: {
            total: ordered.length,
            errors: ordered.filter(item => item.severity === 'error').length,
            warnings: ordered.filter(item => item.severity === 'warning').length,
            violations: ordered.filter(item => item.category === 'violation').length,
            unresolved: ordered.filter(item => item.category === 'unresolved').length,
        },
    }
}

export async function auditProject(projectRoot, { mode = 'strict', configPath } = {}) {
    const root = path.resolve(projectRoot)
    const resolvedConfig = configPath ? path.resolve(configPath) : path.join(root, DEFAULT_CONFIG)
    const loaded = await loadManifest(resolvedConfig)
    if (!loaded.manifest) return resultFor(mode, root, loaded.findings)

    const manifest = loaded.manifest
    const findings = [...(await inspectManifest(root, manifest))]
    let designData = null

    const designInspection = await inspectDeclaredFile(root, manifest.designContract, {
        ruleId: 'contract.design-missing',
        label: 'designContract',
    })
    if (designInspection.finding) {
        findings.push(designInspection.finding)
    } else {
        try {
            const source = await readUtf8(designInspection.target)
            const inspected = inspectDesignContract(source, manifest, relativePath(root, designInspection.target))
            findings.push(...inspected.findings)
            designData = inspected.parsed
        } catch (error) {
            findings.push(
                finding(
                    'contract.design-unreadable',
                    `The design contract is not readable UTF-8: ${error.message}`,
                    'Use a readable UTF-8 Design.md contract.',
                    { file: manifest.designContract, category: 'unresolved' },
                ),
            )
        }
    }

    const uxInspection = await inspectDeclaredFile(root, manifest.canonicalMap, {
        ruleId: 'contract.ux-missing',
        label: 'canonicalMap',
    })
    if (uxInspection.finding) {
        findings.push(uxInspection.finding)
    } else {
        try {
            const source = await readUtf8(uxInspection.target)
            findings.push(...inspectCanonicalMap(source, manifest, relativePath(root, uxInspection.target)))
        } catch (error) {
            findings.push(
                finding(
                    'contract.ux-unreadable',
                    `The UX contract is not readable UTF-8: ${error.message}`,
                    'Use a readable UTF-8 UX contract.',
                    { file: manifest.canonicalMap, category: 'unresolved' },
                ),
            )
        }
    }

    const conceptInspection = await inspectDeclaredFile(root, manifest.approvedConcept, {
        ruleId: 'design.concept-missing',
        label: 'approvedConcept',
    })
    if (conceptInspection.finding) findings.push(conceptInspection.finding)

    findings.push(...(await inspectTokenMapping(root, manifest, designData)))
    findings.push(...(await inspectSource(root, manifest)))
    return resultFor(mode, root, findings)
}

export function exitCodeFor(result) {
    const operationalRules = new Set(['config.invalid-json', 'output.write-failed'])
    if (result.findings.some(item => operationalRules.has(item.ruleId))) return 2
    if (result.mode === 'report') return 0
    if (result.findings.some(item => item.category === 'unresolved')) return 2
    if (result.findings.some(item => item.category === 'violation' && item.severity === 'error')) return 1
    return 0
}

export function parseArguments(args, cwd = process.cwd()) {
    const options = {
        projectRoot: cwd,
        mode: 'strict',
        configPath: null,
        outputPath: null,
        noWrite: false,
    }
    let positionalRoot = false

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]
        if (argument === '--mode') {
            const mode = args[++index]
            if (!['report', 'strict'].includes(mode)) throw new Error('--mode must be report or strict.')
            options.mode = mode
        } else if (argument === '--config') {
            const value = args[++index]
            if (!value) throw new Error('--config requires a path.')
            options.configPath = path.resolve(cwd, value)
        } else if (argument === '--output') {
            const value = args[++index]
            if (!value) throw new Error('--output requires a path.')
            options.outputPath = path.resolve(cwd, value)
        } else if (argument === '--no-write') {
            options.noWrite = true
        } else if (argument.startsWith('-')) {
            throw new Error(`Unknown option: ${argument}`)
        } else if (!positionalRoot) {
            options.projectRoot = path.resolve(cwd, argument)
            positionalRoot = true
        } else {
            throw new Error(`Unexpected positional argument: ${argument}`)
        }
    }

    return options
}

export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
    let options
    try {
        options = parseArguments(args, cwd)
    } catch (error) {
        console.error(`Premium UI audit: ${error.message}`)
        return 2
    }

    let result = await auditProject(options.projectRoot, {
        mode: options.mode,
        configPath: options.configPath,
    })
    let rendered = `${JSON.stringify(result, null, 2)}\n`

    if (!options.noWrite) {
        const outputPath = options.outputPath ?? path.join(options.projectRoot, DEFAULT_OUTPUT)
        try {
            await mkdir(path.dirname(outputPath), { recursive: true })
            await writeFile(outputPath, rendered, 'utf8')
        } catch (error) {
            result = resultFor(result.mode, result.projectRoot, [
                ...result.findings,
                finding(
                    'output.write-failed',
                    `The audit report could not be written: ${error.message}`,
                    'Choose a writable --output path or pass --no-write.',
                    { file: outputPath, category: 'unresolved' },
                ),
            ])
            rendered = `${JSON.stringify(result, null, 2)}\n`
        }
    }

    process.stdout.write(rendered)
    return exitCodeFor(result)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = await main()
}
