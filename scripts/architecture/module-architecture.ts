import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import ts from 'typescript'

const DEFAULT_MODULES_DIRECTORY = 'src/libs/modules'
const DEFAULT_TSCONFIG_PATH = 'tsconfig.json'
// Nest generates this aggregate during builds; its DTO imports describe Swagger metadata,
// not application dependencies. Other files named metadata.ts remain architecture inputs.
const GENERATED_SWAGGER_METADATA_PATH = 'src/metadata.ts'
const BUSINESS_MODULE_ALIAS_PREFIX = '@tuposoft/lead-email-finder/modules/'
const ALLOWED_LAYERS = ['api', 'application', 'domain', 'infrastructure'] as const
const REQUIRED_README_SECTIONS = [
    'Responsibility',
    'Non-Responsibilities',
    'Public API',
    'Dependencies',
    'HTTP Surface',
    'Persistence',
    'Configuration',
    'Validation',
] as const
const TECHNICAL_PACKAGE_PREFIXES = [
    '@automapper/',
    '@aws-sdk/',
    '@nestjs/',
    '@paddle/',
    'axios',
    'bullmq',
    'class-transformer',
    'class-validator',
    'express',
    'ioredis',
    'jose',
    'multer-s3',
    'nestjs-s3',
    'pg',
    'pino',
    'typeorm',
] as const
const TECHNICAL_INTERNAL_ALIASES = [
    '@tuposoft/lead-email-finder/catch-all',
    '@tuposoft/lead-email-finder/config',
    '@tuposoft/lead-email-finder/dns',
    '@tuposoft/lead-email-finder/key',
    '@tuposoft/lead-email-finder/redis',
    '@tuposoft/lead-email-finder/socket',
] as const
const JEST_MODULE_METHODS = new Set([
    'mock',
    'doMock',
    'unmock',
    'dontMock',
    'setMock',
    'deepUnmock',
    'createMockFromModule',
    'genMockFromModule',
    'requireActual',
    'requireMock',
])

export const ARCHITECTURE_RULE_IDS = [
    'module-name',
    'module-readme',
    'module-src',
    'module-barrel',
    'module-catalog',
    'module-readme-sections',
    'source-placement',
    'api-placement',
    'layer-dependency',
    'technical-dependency',
    'cross-module-public-api',
    'barrel-escape',
    'undocumented-dependency',
    'module-cycle',
] as const

export type ArchitectureLayer = (typeof ALLOWED_LAYERS)[number]

export type ArchitectureRuleId = (typeof ARCHITECTURE_RULE_IDS)[number]

export interface ArchitectureViolation {
    readonly key: string
    readonly ruleId: ArchitectureRuleId
    readonly source?: string
    readonly target?: string
    readonly line?: number
    readonly column?: number
    readonly message: string
}

export interface ArchitectureScanOptions {
    /** Absolute or repository-relative path to the repository root. */
    readonly rootDir: string
    /** Absolute or root-relative modules directory. Defaults to `src/libs/modules`. */
    readonly modulesDir?: string
    /** Absolute or root-relative compiler configuration. Defaults to `tsconfig.json`. */
    readonly tsconfigPath?: string
}

export interface ArchitectureScanResult {
    readonly modules: readonly string[]
    readonly violations: readonly ArchitectureViolation[]
}

export class ArchitectureScanError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ArchitectureScanError'
    }
}

interface RawViolation {
    readonly ruleId: ArchitectureRuleId
    readonly source?: string
    readonly target?: string
    readonly line?: number
    readonly column?: number
    readonly message: string
}

interface BusinessModule {
    readonly name: string
    readonly rootDir: string
    readonly srcDir: string
    readonly readmePath: string
    readonly barrelPath: string
    readonly documentedDependencies: ReadonlySet<string>
}

interface CompilerConfiguration {
    readonly fileNames: readonly string[]
    readonly options: ts.CompilerOptions
    readonly basePath: string
}

interface ParsedSource {
    readonly absolutePath: string
    readonly relativePath: string
    readonly sourceFile: ts.SourceFile
    readonly module?: BusinessModule
    readonly layer?: ArchitectureLayer
    readonly production: boolean
}

type ModuleReferenceKind = 'import' | 'export' | 'import-equals' | 'dynamic-import' | 'import-type' | 'require' | 'jest'

interface ModuleReference {
    readonly kind: ModuleReferenceKind
    readonly specifier: string
    readonly node: ts.StringLiteralLike
    exported: boolean
}
const LAYER_DEPENDENCIES: Readonly<Record<ArchitectureLayer, ReadonlySet<ArchitectureLayer>>> = {
    api: new Set(['api', 'application', 'domain']),
    application: new Set(['application', 'domain']),
    domain: new Set(['domain']),
    infrastructure: new Set(['infrastructure', 'application', 'domain']),
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/')
}

function resolveFromRoot(rootDir: string, path: string | undefined, fallback: string): string {
    const chosen = path ?? fallback
    return resolve(rootDir, chosen)
}

function repositoryPath(rootDir: string, absolutePath: string): string {
    return normalizePath(relative(rootDir, absolutePath))
}

function isWithin(parent: string, candidate: string): boolean {
    const relativePath = relative(parent, candidate)
    return (
        relativePath === '' ||
        (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
    )
}

function isFile(path: string): boolean {
    return existsSync(path) && statSync(path).isFile()
}

function isDirectory(path: string): boolean {
    return existsSync(path) && statSync(path).isDirectory()
}

function isProductionTypeScript(path: string): boolean {
    const normalized = normalizePath(path)
    return (
        !normalized.split('/').includes('__tests__') &&
        !normalized.endsWith('.spec.ts') &&
        !normalized.endsWith('.test.ts')
    )
}

function architectureLayer(module: BusinessModule, absolutePath: string): ArchitectureLayer | undefined {
    if (!isWithin(module.srcDir, absolutePath)) {
        return undefined
    }

    const [firstSegment] = normalizePath(relative(module.srcDir, absolutePath)).split('/')
    return ALLOWED_LAYERS.find(layer => layer === firstSegment)
}

function moduleForPath(modules: readonly BusinessModule[], absolutePath: string): BusinessModule | undefined {
    return modules.find(module => isWithin(module.rootDir, absolutePath))
}

function lineAndColumn(sourceFile: ts.SourceFile, node: ts.Node): Pick<RawViolation, 'line' | 'column'> {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    return { line: location.line + 1, column: location.character + 1 }
}

function lineAndColumnForOffset(text: string, offset: number): Pick<RawViolation, 'line' | 'column'> {
    const prefix = text.slice(0, offset)
    const lines = prefix.split('\n')
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionBody(contents: string, heading: string): { text: string; offset: number } | undefined {
    const visibleContents = visibleMarkdown(contents)
    const headingPattern = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*\\r?$`, 'm')
    const match = headingPattern.exec(visibleContents)
    if (!match || match.index === undefined) {
        return undefined
    }

    const bodyOffset = match.index + match[0].length
    const remainder = visibleContents.slice(bodyOffset)
    const nextHeading = /^##[ \t]+/m.exec(remainder)
    const bodyEnd = nextHeading?.index === undefined ? contents.length : bodyOffset + nextHeading.index
    const text = contents.slice(bodyOffset, bodyEnd)
    return { text, offset: bodyOffset }
}

function maskMarkdownText(value: string): string {
    return value.replace(/[^\r\n]/g, ' ')
}

/** Masks hidden/code Markdown while preserving offsets used by diagnostics. */
function visibleMarkdown(contents: string): string {
    const withoutComments = contents.replace(/<!--[\s\S]*?(?:-->|$)/g, match => maskMarkdownText(match))
    let fenceCharacter: '`' | '~' | undefined
    let fenceLength = 0
    const lines = withoutComments.split('\n')
    const indentationOf = (line: string): number => {
        const indentation = /^[ \t]*/.exec(line)?.[0] ?? ''
        return [...indentation].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0)
    }
    const listContainerIndentation = (lineIndex: number, indentation: number): number | undefined => {
        for (let index = lineIndex - 1; index >= 0; index -= 1) {
            const candidate = lines[index] ?? ''
            if (candidate.trim() === '') {
                continue
            }
            if (indentationOf(candidate) < indentation) {
                const listItem = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+|$)/.exec(candidate)
                if (!listItem) {
                    return undefined
                }
                const markerIndentation = indentationOf(listItem[1] ?? '')
                const markerWidth = (listItem[2] ?? '').length
                const padding = Math.max(1, Math.min(4, indentationOf(listItem[3] ?? '')))
                return markerIndentation + markerWidth + padding
            }
        }
        return undefined
    }

    const withoutFences = lines
        .map((line, lineIndex) => {
            const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
            if (fenceCharacter === undefined) {
                if (marker) {
                    fenceCharacter = marker[0] as '`' | '~'
                    fenceLength = marker.length
                    return maskMarkdownText(line)
                }
                const indentation = indentationOf(line)
                if (indentation >= 4) {
                    const containerIndentation = listContainerIndentation(lineIndex, indentation)
                    if (containerIndentation === undefined || indentation >= containerIndentation + 4) {
                        return maskMarkdownText(line)
                    }
                }
                return line
            }

            const closingFence = new RegExp(`^ {0,3}${escapeRegExp(fenceCharacter)}{${fenceLength},}\\s*$`).test(line)
            if (closingFence) {
                fenceCharacter = undefined
                fenceLength = 0
            }
            return maskMarkdownText(line)
        })
        .join('\n')

    return withoutFences.replace(/(`+)([\s\S]*?)\1/g, match => maskMarkdownText(match))
}

interface MarkdownModuleLink {
    readonly name: string
    readonly offset: number
}

function normalizeReferenceLabel(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function markdownModuleLinks(
    sectionContents: string,
    documentContents: string,
    relativePrefix: '' | '../',
): MarkdownModuleLink[] {
    const visibleSection = visibleMarkdown(sectionContents)
    const visibleDocument = visibleMarkdown(documentContents)
    const destination = `${escapeRegExp(relativePrefix)}([^/\\s)>]+)\\/README\\.md(?:#[^\\s)>]*)?`
    const links: MarkdownModuleLink[] = []
    const inlinePattern = new RegExp(
        `(?<!!)\\[[^\\]\\r\\n]*\\]\\(\\s*<?${destination}>?(?:\\s+(?:"[^"]*"|'[^']*'|\\([^)]*\\)))?\\s*\\)`,
        'g',
    )

    for (const match of visibleSection.matchAll(inlinePattern)) {
        const name = match[1]
        if (name && match.index !== undefined) {
            links.push({ name, offset: match.index })
        }
    }

    const definitions = new Map<string, string>()
    const definitionPattern = new RegExp(`^ {0,3}\\[([^\\]\\r\\n]+)\\]:\\s*<?${destination}>?(?:\\s+.*)?$`, 'gm')
    for (const match of visibleDocument.matchAll(definitionPattern)) {
        const label = match[1]
        const name = match[2]
        if (label && name) {
            const normalizedLabel = normalizeReferenceLabel(label)
            if (!definitions.has(normalizedLabel)) {
                definitions.set(normalizedLabel, name)
            }
        }
    }

    let referenceSearchText = visibleSection
        .replace(/!\[[^\]\r\n]*\](?:\[[^\]\r\n]*\])?/g, match => maskMarkdownText(match))
        .replace(/^ {0,3}\[[^\]\r\n]+\]:[^\r\n]*$/gm, match => maskMarkdownText(match))
    const fullReferencePattern = /(?<!!)\[([^\]\r\n]+)\]\[([^\]\r\n]*)\]/g
    for (const match of referenceSearchText.matchAll(fullReferencePattern)) {
        const label = match[2] || match[1]
        const name = label ? definitions.get(normalizeReferenceLabel(label)) : undefined
        if (name && match.index !== undefined) {
            links.push({ name, offset: match.index })
        }
    }
    referenceSearchText = referenceSearchText.replace(fullReferencePattern, match => maskMarkdownText(match))

    const shortcutReferencePattern = /(?<!!)\[([^\]\r\n]+)\](?!\s*[[(])/g
    for (const match of referenceSearchText.matchAll(shortcutReferencePattern)) {
        const label = match[1]
        const name = label ? definitions.get(normalizeReferenceLabel(label)) : undefined
        if (name && match.index !== undefined) {
            links.push({ name, offset: match.index })
        }
    }

    return links.sort((left, right) => left.offset - right.offset || compareText(left.name, right.name))
}

function documentedDependencies(contents: string): ReadonlySet<string> {
    const dependencies = sectionBody(contents, 'Dependencies')
    if (!dependencies) {
        return new Set()
    }

    return new Set(markdownModuleLinks(dependencies.text, contents, '../').map(link => link.name))
}

function catalogEntries(contents: string): readonly { name: string; offset: number }[] | undefined {
    const catalog = sectionBody(contents, 'Module Catalog')
    if (!catalog) {
        return undefined
    }

    return markdownModuleLinks(catalog.text, contents, '').map(link => ({
        name: link.name,
        offset: catalog.offset + link.offset,
    }))
}

function discoverModules(rootDir: string, modulesDir: string, violations: RawViolation[]): BusinessModule[] {
    const catalogPath = join(modulesDir, 'README.md')
    const catalogSource = repositoryPath(rootDir, catalogPath)

    if (!isDirectory(modulesDir)) {
        violations.push({
            ruleId: 'module-catalog',
            source: repositoryPath(rootDir, modulesDir),
            target: repositoryPath(rootDir, modulesDir),
            message: 'The business-module directory is missing or is not a directory.',
        })
        return []
    }

    const moduleNames = readdirSync(modulesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort(compareText)

    const catalogContents = isFile(catalogPath) ? readFileSync(catalogPath, 'utf8') : undefined
    if (catalogContents === undefined) {
        violations.push({
            ruleId: 'module-catalog',
            source: catalogSource,
            target: 'README.md',
            message: 'The module catalog README is missing.',
        })
    }

    const modules = moduleNames.map(name => {
        const moduleRoot = join(modulesDir, name)
        const readmePath = join(moduleRoot, 'README.md')
        const srcDir = join(moduleRoot, 'src')
        const barrelPath = join(srcDir, 'index.ts')

        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
            violations.push({
                ruleId: 'module-name',
                source: repositoryPath(rootDir, moduleRoot),
                target: name,
                message: `Business-module directory "${name}" is not kebab-case.`,
            })
        }

        let readmeContents: string | undefined
        if (!isFile(readmePath)) {
            violations.push({
                ruleId: 'module-readme',
                source: repositoryPath(rootDir, readmePath),
                target: name,
                message: `Module "${name}" is missing README.md.`,
            })
        } else {
            readmeContents = readFileSync(readmePath, 'utf8')
            for (const heading of REQUIRED_README_SECTIONS) {
                if (!sectionBody(readmeContents, heading)) {
                    violations.push({
                        ruleId: 'module-readme-sections',
                        source: repositoryPath(rootDir, readmePath),
                        target: heading,
                        message: `Module "${name}" README is missing the "## ${heading}" section.`,
                    })
                }
            }
        }

        if (!isDirectory(srcDir)) {
            violations.push({
                ruleId: 'module-src',
                source: repositoryPath(rootDir, srcDir),
                target: name,
                message: `Module "${name}" is missing its src directory.`,
            })
        }

        if (!isFile(barrelPath)) {
            violations.push({
                ruleId: 'module-barrel',
                source: repositoryPath(rootDir, barrelPath),
                target: name,
                message: `Module "${name}" is missing its public src/index.ts barrel.`,
            })
        }

        return {
            name,
            rootDir: moduleRoot,
            srcDir,
            readmePath,
            barrelPath,
            documentedDependencies: readmeContents ? documentedDependencies(readmeContents) : new Set<string>(),
        }
    })

    if (catalogContents !== undefined) {
        const entries = catalogEntries(catalogContents)
        if (entries === undefined) {
            violations.push({
                ruleId: 'module-catalog',
                source: catalogSource,
                target: 'Module Catalog',
                message: 'The catalog README is missing the "## Module Catalog" section.',
            })
        } else {
            const discoveredNames = new Set(moduleNames)
            const catalogNames = new Set(entries.map(entry => entry.name))
            const seenCatalogNames = new Set<string>()

            for (const moduleName of moduleNames) {
                if (!catalogNames.has(moduleName)) {
                    violations.push({
                        ruleId: 'module-catalog',
                        source: catalogSource,
                        target: moduleName,
                        message: `Module "${moduleName}" is missing from the module catalog.`,
                    })
                }
            }

            for (const entry of entries) {
                if (seenCatalogNames.has(entry.name)) {
                    violations.push({
                        ruleId: 'module-catalog',
                        source: catalogSource,
                        target: entry.name,
                        ...lineAndColumnForOffset(catalogContents, entry.offset),
                        message: `Module "${entry.name}" appears more than once in the module catalog.`,
                    })
                }
                seenCatalogNames.add(entry.name)

                if (!discoveredNames.has(entry.name)) {
                    violations.push({
                        ruleId: 'module-catalog',
                        source: catalogSource,
                        target: entry.name,
                        ...lineAndColumnForOffset(catalogContents, entry.offset),
                        message: `Catalog entry "${entry.name}" does not identify a module directory.`,
                    })
                }
            }
        }
    }

    return modules
}

function walkTypeScriptFiles(directory: string): string[] {
    if (!isDirectory(directory)) {
        return []
    }

    const files: string[] = []
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        compareText(left.name, right.name),
    )) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            files.push(...walkTypeScriptFiles(path))
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            files.push(path)
        }
    }
    return files
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
    return ts
        .formatDiagnostics(diagnostics, {
            getCanonicalFileName: fileName => fileName,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => '\n',
        })
        .trim()
}

function loadCompilerConfiguration(tsconfigPath: string): CompilerConfiguration {
    const config = ts.readConfigFile(tsconfigPath, fileName => ts.sys.readFile(fileName))
    if (config.error) {
        throw new ArchitectureScanError(
            `Unable to read ${normalizePath(tsconfigPath)}:\n${formatDiagnostics([config.error])}`,
        )
    }

    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(tsconfigPath), undefined, tsconfigPath)
    const actionableErrors = parsed.errors.filter(error => error.code !== 18003)
    if (actionableErrors.length > 0) {
        throw new ArchitectureScanError(
            `Invalid TypeScript configuration ${normalizePath(tsconfigPath)}:\n${formatDiagnostics(actionableErrors)}`,
        )
    }

    return { fileNames: parsed.fileNames, options: parsed.options, basePath: dirname(tsconfigPath) }
}

function parseSources(
    rootDir: string,
    modulesDir: string,
    modules: readonly BusinessModule[],
    compiler: CompilerConfiguration,
): ParsedSource[] {
    const fileNames = new Set(
        [...compiler.fileNames, ...walkTypeScriptFiles(modulesDir)]
            .filter(fileName => fileName.endsWith('.ts'))
            .map(fileName => resolve(fileName))
            .filter(fileName => repositoryPath(rootDir, fileName) !== GENERATED_SWAGGER_METADATA_PATH),
    )

    return [...fileNames].sort(compareText).map(absolutePath => {
        let contents: string
        try {
            contents = readFileSync(absolutePath, 'utf8')
        } catch (error) {
            throw new ArchitectureScanError(
                `Unable to read TypeScript source ${repositoryPath(rootDir, absolutePath)}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }

        const sourceFile = ts.createSourceFile(
            absolutePath,
            contents,
            compiler.options.target ?? ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS,
        )
        const parseDiagnostics = (
            sourceFile as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
        ).parseDiagnostics
        if (parseDiagnostics && parseDiagnostics.length > 0) {
            throw new ArchitectureScanError(
                `Unable to parse ${repositoryPath(rootDir, absolutePath)}:\n${formatDiagnostics(parseDiagnostics)}`,
            )
        }

        const module = moduleForPath(modules, absolutePath)
        return {
            absolutePath,
            relativePath: repositoryPath(rootDir, absolutePath),
            sourceFile,
            module,
            layer: module ? architectureLayer(module, absolutePath) : undefined,
            production: isProductionTypeScript(repositoryPath(rootDir, absolutePath)),
        }
    })
}

function collectModuleReferences(sourceFile: ts.SourceFile): ModuleReference[] {
    const references: ModuleReference[] = []
    const bindingOrigins = new Map<string, Set<ModuleReference>>()
    const locallyExportedBindings = new Set<string>()

    const addStringReference = (
        kind: ModuleReferenceKind,
        expression: ts.Expression | undefined,
        exported = false,
        bindings: readonly string[] = [],
    ): void => {
        if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
            const reference: ModuleReference = { kind, specifier: expression.text, node: expression, exported }
            references.push(reference)
            for (const binding of bindings) {
                const origins = bindingOrigins.get(binding) ?? new Set<ModuleReference>()
                origins.add(reference)
                bindingOrigins.set(binding, origins)
            }
        }
    }

    const importBindings = (node: ts.ImportDeclaration): string[] => {
        const clause = node.importClause
        if (!clause) {
            return []
        }

        const bindings = clause.name ? [clause.name.text] : []
        if (clause.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
                bindings.push(clause.namedBindings.name.text)
            } else {
                bindings.push(...clause.namedBindings.elements.map(element => element.name.text))
            }
        }
        return bindings
    }

    const unwrappedExpression = (expression: ts.Expression): ts.Expression => {
        let current = expression
        while (
            ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) ||
            ts.isTypeAssertionExpression(current) ||
            ts.isNonNullExpression(current) ||
            ts.isSatisfiesExpression(current)
        ) {
            current = current.expression
        }
        return current
    }

    const isCommonJsExportTarget = (expression: ts.Expression): boolean =>
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        ((expression.expression.text === 'module' && expression.name.text === 'exports') ||
            expression.expression.text === 'exports')

    const isDirectlyExportedInitializer = (expression: ts.Expression): boolean => {
        let current = expression
        let parent = current.parent
        while (
            parent &&
            (ts.isParenthesizedExpression(parent) ||
                ts.isAsExpression(parent) ||
                ts.isTypeAssertionExpression(parent) ||
                ts.isNonNullExpression(parent) ||
                ts.isSatisfiesExpression(parent)) &&
            parent.expression === current
        ) {
            current = parent
            parent = current.parent
        }

        if (parent && ts.isExportAssignment(parent) && parent.expression === current) {
            return true
        }
        if (
            parent &&
            ts.isBinaryExpression(parent) &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            parent.right === current &&
            isCommonJsExportTarget(parent.left) &&
            ts.isExpressionStatement(parent.parent) &&
            parent.parent.parent === sourceFile
        ) {
            return true
        }
        if (!parent || !ts.isVariableDeclaration(parent) || parent.initializer !== current) {
            return false
        }

        const declarationList = parent.parent
        const statement = declarationList.parent
        return (
            ts.isVariableDeclarationList(declarationList) &&
            ts.isVariableStatement(statement) &&
            (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
        )
    }

    const jestMethodName = (expression: ts.LeftHandSideExpression): string | undefined => {
        if (
            ts.isPropertyAccessExpression(expression) &&
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === 'jest'
        ) {
            return expression.name.text
        }
        if (
            ts.isElementAccessExpression(expression) &&
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === 'jest' &&
            expression.argumentExpression &&
            (ts.isStringLiteral(expression.argumentExpression) ||
                ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
        ) {
            return expression.argumentExpression.text
        }
        return undefined
    }

    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) {
            addStringReference('import', node.moduleSpecifier, false, importBindings(node))
        } else if (ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier) {
                addStringReference('export', node.moduleSpecifier, true)
            } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                for (const element of node.exportClause.elements) {
                    locallyExportedBindings.add((element.propertyName ?? element.name).text)
                }
            }
        } else if (ts.isExportAssignment(node)) {
            const expression = unwrappedExpression(node.expression)
            if (ts.isIdentifier(expression)) {
                locallyExportedBindings.add(expression.text)
            }
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
            const exported = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
            addStringReference('import-equals', node.moduleReference.expression, exported, [node.name.text])
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
            addStringReference('import-type', node.argument.literal)
        } else if (ts.isCallExpression(node)) {
            const directlyExported = isDirectlyExportedInitializer(node)
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                addStringReference('dynamic-import', node.arguments[0], directlyExported)
            } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                addStringReference('require', node.arguments[0], directlyExported)
            } else {
                const methodName = jestMethodName(node.expression)
                if (methodName && JEST_MODULE_METHODS.has(methodName)) {
                    addStringReference('jest', node.arguments[0], directlyExported)
                }
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    for (const binding of locallyExportedBindings) {
        for (const reference of bindingOrigins.get(binding) ?? []) {
            reference.exported = true
        }
    }
    return references.sort((left, right) => left.node.getStart(sourceFile) - right.node.getStart(sourceFile))
}

function isRelativeSpecifier(specifier: string): boolean {
    return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')
}

function moduleAliasTarget(specifier: string): { name: string } | undefined {
    if (!specifier.startsWith(BUSINESS_MODULE_ALIAS_PREFIX)) {
        return undefined
    }

    const remainder = specifier.slice(BUSINESS_MODULE_ALIAS_PREFIX.length)
    const slashIndex = remainder.indexOf('/')
    const name = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex)
    if (!name) {
        return undefined
    }
    return { name }
}

function matchesPackageRoot(specifier: string, packageName: string): boolean {
    return packageName.endsWith('/')
        ? specifier.startsWith(packageName)
        : specifier === packageName || specifier.startsWith(`${packageName}/`)
}

function isTechnicalDependency(specifier: string): boolean {
    return (
        TECHNICAL_PACKAGE_PREFIXES.some(packageName => matchesPackageRoot(specifier, packageName)) ||
        TECHNICAL_INTERNAL_ALIASES.some(packageName => matchesPackageRoot(specifier, packageName))
    )
}

function relevantRelativeResolution(source: ParsedSource, modulesDir: string, specifier: string): boolean {
    if (source.module) {
        return true
    }

    const lexicalTarget = resolve(dirname(source.absolutePath), specifier)
    return isWithin(modulesDir, lexicalTarget)
}

function resolveReference(
    source: ParsedSource,
    reference: ModuleReference,
    modulesDir: string,
    compiler: CompilerConfiguration,
    resolutionCache: ts.ModuleResolutionCache,
): string | undefined {
    const alias = moduleAliasTarget(reference.specifier)
    const resolution = ts.resolveModuleName(
        reference.specifier,
        source.absolutePath,
        compiler.options,
        ts.sys,
        resolutionCache,
    ).resolvedModule
    if (!resolution) {
        const relevant =
            alias !== undefined ||
            (isRelativeSpecifier(reference.specifier) &&
                relevantRelativeResolution(source, modulesDir, reference.specifier))
        if (!relevant) {
            return undefined
        }

        const location = lineAndColumn(source.sourceFile, reference.node)
        throw new ArchitectureScanError(
            `Unable to resolve "${reference.specifier}" from ${source.relativePath}:${location.line}:${location.column}.`,
        )
    }
    return resolve(resolution.resolvedFileName)
}

function addPlacementViolations(sources: readonly ParsedSource[], violations: RawViolation[]): void {
    for (const source of sources) {
        const module = source.module
        if (!module || !source.production) {
            continue
        }

        const insideSrc = isWithin(module.srcDir, source.absolutePath)
        const pathWithinSrc = insideSrc
            ? normalizePath(relative(module.srcDir, source.absolutePath))
            : normalizePath(relative(module.rootDir, source.absolutePath))
        const allowedRootFile =
            insideSrc && (pathWithinSrc === 'index.ts' || pathWithinSrc === `${module.name}.module.ts`)
        if (!source.layer && !allowedRootFile) {
            violations.push({
                ruleId: 'source-placement',
                source: source.relativePath,
                target: pathWithinSrc,
                message: `Production source in module "${module.name}" must live in a standard layer or an allowed module root file.`,
            })
        }

        if (
            (source.absolutePath.endsWith('.controller.ts') || source.absolutePath.endsWith('.dto.ts')) &&
            source.layer !== 'api'
        ) {
            violations.push({
                ruleId: 'api-placement',
                source: source.relativePath,
                target: source.layer ?? pathWithinSrc,
                message: 'Production controllers and DTOs must live below the api layer.',
            })
        }
    }
}

function addImportViolations(
    modulesDir: string,
    modules: readonly BusinessModule[],
    sources: readonly ParsedSource[],
    compiler: CompilerConfiguration,
    violations: RawViolation[],
): ReadonlyMap<string, ReadonlySet<string>> {
    const graph = new Map<string, Set<string>>(modules.map(module => [module.name, new Set<string>()]))
    const resolutionCache = ts.createModuleResolutionCache(
        compiler.basePath,
        fileName => (compiler.options.forceConsistentCasingInFileNames ? fileName : fileName.toLowerCase()),
        compiler.options,
    )

    for (const source of sources) {
        for (const reference of collectModuleReferences(source.sourceFile)) {
            const location = lineAndColumn(source.sourceFile, reference.node)
            const aliasTarget = moduleAliasTarget(reference.specifier)
            const resolvedPath = resolveReference(source, reference, modulesDir, compiler, resolutionCache)
            const resolvedModule = resolvedPath ? moduleForPath(modules, resolvedPath) : undefined

            if (aliasTarget && !modules.some(module => module.name === aliasTarget.name)) {
                throw new ArchitectureScanError(
                    `Business-module alias "${reference.specifier}" in ${source.relativePath}:${location.line}:${location.column} names unknown module "${aliasTarget.name}".`,
                )
            }
            if (aliasTarget && resolvedModule?.name !== aliasTarget.name) {
                throw new ArchitectureScanError(
                    `Business-module alias "${reference.specifier}" in ${source.relativePath}:${location.line}:${location.column} resolved outside module "${aliasTarget.name}".`,
                )
            }

            const targetModule =
                resolvedModule ?? (aliasTarget ? modules.find(module => module.name === aliasTarget.name) : undefined)

            if (
                source.production &&
                (source.layer === 'application' || source.layer === 'domain') &&
                isTechnicalDependency(reference.specifier)
            ) {
                violations.push({
                    ruleId: 'technical-dependency',
                    source: source.relativePath,
                    target: reference.specifier,
                    ...location,
                    message: `${source.layer} source may not import technical package "${reference.specifier}".`,
                })
            }

            if (targetModule && targetModule.name !== source.module?.name) {
                const publicAlias = `${BUSINESS_MODULE_ALIAS_PREFIX}${targetModule.name}`
                if (reference.specifier !== publicAlias) {
                    violations.push({
                        ruleId: 'cross-module-public-api',
                        source: source.relativePath,
                        target: reference.specifier,
                        ...location,
                        message: `Consumers of module "${targetModule.name}" must import its bare public barrel "${publicAlias}".`,
                    })
                }

                if (source.production && source.module) {
                    graph.get(source.module.name)?.add(targetModule.name)
                }
            }

            if (
                source.production &&
                source.module &&
                source.layer &&
                targetModule?.name === source.module.name &&
                resolvedPath
            ) {
                const targetLayer = architectureLayer(source.module, resolvedPath)
                if (!targetLayer) {
                    violations.push({
                        ruleId: 'layer-dependency',
                        source: source.relativePath,
                        target: reference.specifier,
                        ...location,
                        message: `${source.layer} source may not import its module root.`,
                    })
                } else if (!LAYER_DEPENDENCIES[source.layer].has(targetLayer)) {
                    violations.push({
                        ruleId: 'layer-dependency',
                        source: source.relativePath,
                        target: reference.specifier,
                        ...location,
                        message: `The ${source.layer} layer may not depend on the ${targetLayer} layer.`,
                    })
                }
            }

            if (
                source.module &&
                source.absolutePath === source.module.barrelPath &&
                reference.exported &&
                (!isRelativeSpecifier(reference.specifier) ||
                    !resolvedPath ||
                    !isWithin(source.module.rootDir, resolvedPath))
            ) {
                violations.push({
                    ruleId: 'barrel-escape',
                    source: source.relativePath,
                    target: reference.specifier,
                    ...location,
                    message: 'A module barrel may export only relative paths that resolve inside its own module.',
                })
            }
        }
    }

    return graph
}

function addDocumentedDependencyViolations(
    rootDir: string,
    modules: readonly BusinessModule[],
    graph: ReadonlyMap<string, ReadonlySet<string>>,
    violations: RawViolation[],
): void {
    for (const module of modules) {
        for (const dependency of [...(graph.get(module.name) ?? [])].sort(compareText)) {
            if (!module.documentedDependencies.has(dependency)) {
                violations.push({
                    ruleId: 'undocumented-dependency',
                    source: repositoryPath(rootDir, module.readmePath),
                    target: dependency,
                    message: `Production dependency from "${module.name}" to "${dependency}" is not linked in the README Dependencies section.`,
                })
            }
        }
    }
}

function stronglyConnectedComponents(graph: ReadonlyMap<string, ReadonlySet<string>>): readonly string[][] {
    let nextIndex = 0
    const indexes = new Map<string, number>()
    const lowLinks = new Map<string, number>()
    const stack: string[] = []
    const onStack = new Set<string>()
    const components: string[][] = []

    const visit = (moduleName: string): void => {
        indexes.set(moduleName, nextIndex)
        lowLinks.set(moduleName, nextIndex)
        nextIndex += 1
        stack.push(moduleName)
        onStack.add(moduleName)

        for (const dependency of [...(graph.get(moduleName) ?? [])].sort(compareText)) {
            if (!indexes.has(dependency)) {
                visit(dependency)
                lowLinks.set(moduleName, Math.min(lowLinks.get(moduleName)!, lowLinks.get(dependency)!))
            } else if (onStack.has(dependency)) {
                lowLinks.set(moduleName, Math.min(lowLinks.get(moduleName)!, indexes.get(dependency)!))
            }
        }

        if (lowLinks.get(moduleName) !== indexes.get(moduleName)) {
            return
        }

        const component: string[] = []
        let member: string | undefined
        do {
            member = stack.pop()
            if (member !== undefined) {
                onStack.delete(member)
                component.push(member)
            }
        } while (member !== moduleName)
        components.push(component.sort(compareText))
    }

    for (const moduleName of [...graph.keys()].sort(compareText)) {
        if (!indexes.has(moduleName)) {
            visit(moduleName)
        }
    }

    return components
}

function addCycleViolations(
    rootDir: string,
    modulesDir: string,
    graph: ReadonlyMap<string, ReadonlySet<string>>,
    violations: RawViolation[],
): void {
    const cyclicComponents = stronglyConnectedComponents(graph)
        .filter(component => component.length > 1)
        .sort((left, right) => compareText(left.join(','), right.join(',')))

    for (const component of cyclicComponents) {
        violations.push({
            ruleId: 'module-cycle',
            source: repositoryPath(rootDir, modulesDir),
            target: component.join(','),
            message: `Production module dependency cycle contains: ${component.join(', ')}.`,
        })
    }
}

function violationBaseKey(violation: RawViolation): string {
    const escapeKeyPart = (value: string): string =>
        value.replaceAll('%', '%25').replaceAll('|', '%7C').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
    const presentKeyPart = (value: string | undefined, fallback: string): string =>
        value === undefined ? fallback : value === '' ? '<empty>' : value

    return [
        violation.ruleId,
        presentKeyPart(violation.source, '<repository>'),
        presentKeyPart(violation.target, '<none>'),
    ]
        .map(escapeKeyPart)
        .join('|')
}

function finalizeViolations(rawViolations: readonly RawViolation[]): ArchitectureViolation[] {
    const occurrences = new Map<string, number>()
    const violations = rawViolations.map(violation => {
        const baseKey = violationBaseKey(violation)
        const occurrence = (occurrences.get(baseKey) ?? 0) + 1
        occurrences.set(baseKey, occurrence)
        return {
            ...violation,
            key: occurrence === 1 ? baseKey : `${baseKey}|occurrence=${occurrence}`,
        }
    })
    return violations.sort((left, right) => compareText(left.key, right.key))
}

/**
 * Scans the repository without mutating it. Structural problems are returned as stable violations;
 * malformed TypeScript, compiler configuration, or relevant unresolved imports stop the scan.
 */
export function scanModuleArchitecture(options: ArchitectureScanOptions): ArchitectureScanResult {
    const rootDir = resolve(options.rootDir)
    const modulesDir = resolveFromRoot(rootDir, options.modulesDir, DEFAULT_MODULES_DIRECTORY)
    const tsconfigPath = resolveFromRoot(rootDir, options.tsconfigPath, DEFAULT_TSCONFIG_PATH)
    const rawViolations: RawViolation[] = []
    const modules = discoverModules(rootDir, modulesDir, rawViolations)
    const compiler = loadCompilerConfiguration(tsconfigPath)
    const sources = parseSources(rootDir, modulesDir, modules, compiler)

    addPlacementViolations(sources, rawViolations)
    const graph = addImportViolations(modulesDir, modules, sources, compiler, rawViolations)
    addDocumentedDependencyViolations(rootDir, modules, graph, rawViolations)
    addCycleViolations(rootDir, modulesDir, graph, rawViolations)

    return {
        modules: modules.map(module => module.name),
        violations: finalizeViolations(rawViolations),
    }
}
