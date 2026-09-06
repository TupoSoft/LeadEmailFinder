import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
    compareViolationSets,
    parseBaseline,
    scanModuleArchitecture,
    serializeBaseline,
    type ArchitectureViolation,
} from './module-architecture'
import { BASELINE_RELATIVE_PATH, readBaseBaseline, runArchitectureCli } from './check-module-architecture'

const MODULE_ALIAS_PREFIX = '@tuposoft/lead-email-finder/modules/'
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

const fixtureRoots: string[] = []

interface ModuleOptions {
    dependencies?: readonly string[]
    files?: Readonly<Record<string, string>>
}

interface Capture {
    readonly writer: { write(text: string): void }
    value(): string
}

function captureText(): Capture {
    let output = ''
    return {
        writer: {
            write(text: string): void {
                output += text
            },
        },
        value: () => output,
    }
}

function write(path: string, contents: string): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents, 'utf8')
}

function moduleReadme(name: string, dependencies: readonly string[] = []): string {
    const dependencyText =
        dependencies.length === 0
            ? 'None.'
            : dependencies
                  .map(dependency => `- [\`${dependency}\`](../${dependency}/README.md) — ${dependency} capability`)
                  .join('\n')

    return `# ${name}\n\n${REQUIRED_README_SECTIONS.map(section => {
        const contents =
            section === 'Dependencies'
                ? dependencyText
                : section === 'Public API'
                  ? '[`src/index.ts`](src/index.ts) exports the public contract.'
                  : `${section} fixture documentation.`
        return `## ${section}\n\n${contents}`
    }).join('\n\n')}\n`
}

class FixtureRepository {
    readonly rootDir: string
    readonly modulesDir: string
    private readonly moduleNames = new Set<string>()
    private readonly pathOverrides: Record<string, string[]> = {}

    constructor() {
        this.rootDir = mkdtempSync(join(tmpdir(), 'lef-module-architecture-'))
        fixtureRoots.push(this.rootDir)
        this.modulesDir = join(this.rootDir, 'src/libs/modules')
        mkdirSync(this.modulesDir, { recursive: true })
        write(join(this.modulesDir, 'AGENTS.md'), '# Fixture agent instructions\n')
        this.refreshCatalog()
        this.refreshTsconfig()
    }

    addModule(name: string, options: ModuleOptions = {}): this {
        this.moduleNames.add(name)
        const moduleRoot = join(this.modulesDir, name)
        write(join(moduleRoot, 'README.md'), moduleReadme(name, options.dependencies))
        write(join(moduleRoot, 'src/index.ts'), '')
        for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
            write(join(moduleRoot, 'src', relativePath), contents)
        }
        this.refreshCatalog()
        this.refreshTsconfig()
        return this
    }

    addRootFile(relativePath: string, contents: string): this {
        write(join(this.rootDir, relativePath), contents)
        return this
    }

    modulePath(name: string, relativePath = ''): string {
        return join(this.modulesDir, name, relativePath)
    }

    removeModuleFile(name: string, relativePath: string): this {
        rmSync(this.modulePath(name, relativePath), { force: true, recursive: true })
        return this
    }

    setCatalog(names: readonly string[]): this {
        this.writeCatalog(names)
        return this
    }

    setModuleReadme(name: string, contents: string): this {
        write(this.modulePath(name, 'README.md'), contents)
        return this
    }

    setModuleDependencies(name: string, dependencies: readonly string[]): this {
        return this.setModuleReadme(name, moduleReadme(name, dependencies))
    }

    setPathMapping(specifier: string, targets: readonly string[]): this {
        this.pathOverrides[specifier] = [...targets]
        this.refreshTsconfig()
        return this
    }

    writeModuleFile(name: string, relativePath: string, contents: string): this {
        write(this.modulePath(name, join('src', relativePath)), contents)
        return this
    }

    private refreshCatalog(): void {
        this.writeCatalog([...this.moduleNames].sort())
    }

    private writeCatalog(names: readonly string[]): void {
        const entries = names.map(name => `- [\`${name}\`](${name}/README.md) — ${name} fixture module`).join('\n')
        write(
            join(this.modulesDir, 'README.md'),
            `# Modules Directory\n\n## Standard Folder Structure\n\nFixture structure.\n\n## Guidelines\n\nFixture guidelines.\n\n## Module Documentation\n\nFixture documentation.\n\n## Module Catalog\n\n${entries}\n`,
        )
    }

    private refreshTsconfig(): void {
        const paths: Record<string, string[]> = {}
        for (const name of [...this.moduleNames].sort()) {
            paths[`${MODULE_ALIAS_PREFIX}${name}`] = [`src/libs/modules/${name}/src`]
            paths[`${MODULE_ALIAS_PREFIX}${name}/*`] = [`src/libs/modules/${name}/src/*`]
        }
        for (const name of ['catch-all', 'common', 'config', 'dns', 'key', 'redis', 'socket']) {
            paths[`@tuposoft/lead-email-finder/${name}`] = [`src/libs/${name}/src`]
            paths[`@tuposoft/lead-email-finder/${name}/*`] = [`src/libs/${name}/src/*`]
            write(join(this.rootDir, `src/libs/${name}/src/index.ts`), '')
        }
        Object.assign(paths, this.pathOverrides)

        write(
            join(this.rootDir, 'tsconfig.json'),
            `${JSON.stringify(
                {
                    compilerOptions: {
                        baseUrl: '.',
                        module: 'commonjs',
                        paths,
                        strict: true,
                        target: 'ES2023',
                    },
                    include: ['src/**/*.ts'],
                },
                null,
                4,
            )}\n`,
        )
    }
}

function scan(fixture: FixtureRepository): readonly ArchitectureViolation[] {
    return scanModuleArchitecture({ rootDir: fixture.rootDir }).violations
}

function violationsFor(fixture: FixtureRepository, ruleId: string): readonly ArchitectureViolation[] {
    return scan(fixture).filter(violation => violation.ruleId === ruleId)
}

function git(fixture: FixtureRepository, args: readonly string[]): string {
    return execFileSync('git', args, {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            GIT_AUTHOR_EMAIL: 'architecture-fixture@example.com',
            GIT_AUTHOR_NAME: 'Architecture Fixture',
            GIT_COMMITTER_EMAIL: 'architecture-fixture@example.com',
            GIT_COMMITTER_NAME: 'Architecture Fixture',
        },
    }).trim()
}

function initializeGit(fixture: FixtureRepository): void {
    git(fixture, ['init', '--quiet'])
    git(fixture, ['add', '.'])
    git(fixture, ['commit', '--quiet', '-m', 'fixture base'])
}

function commitFixture(fixture: FixtureRepository, message: string): string {
    git(fixture, ['add', '.'])
    git(fixture, ['commit', '--quiet', '-m', message])
    return git(fixture, ['rev-parse', 'HEAD'])
}

function createAdoptionFixture(baselineKeys: readonly string[] = []): {
    baseSha: string
    fixture: FixtureRepository
} {
    const fixture = new FixtureRepository().addModule('orders', {
        files: {
            'helper.ts': 'export const helper = true\n',
        },
    })
    fixture.addRootFile('scripts/architecture/module-architecture.ts', 'export const fixtureScannerVersion = 1\n')
    fixture.addRootFile('.gitignore', 'src/ignored-architecture-input.ts\n')
    const tsconfigPath = join(fixture.rootDir, 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as { include: string[] }
    tsconfig.include.push('scripts/**/*.ts')
    fixture.addRootFile('tsconfig.json', `${JSON.stringify(tsconfig, null, 4)}\n`)
    initializeGit(fixture)
    write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline(baselineKeys))
    const baseSha = commitFixture(fixture, 'adopt architecture baseline')
    return { baseSha, fixture }
}

function runCli(
    fixture: FixtureRepository,
    args: readonly string[] = [],
    environment: NodeJS.ProcessEnv = {},
): { code: number; stderr: string; stdout: string } {
    const stdout = captureText()
    const stderr = captureText()
    const code = runArchitectureCli({
        args,
        env: environment,
        rootDir: fixture.rootDir,
        stderr: stderr.writer,
        stdout: stdout.writer,
    })
    return { code, stderr: stderr.value(), stdout: stdout.value() }
}

afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
        rmSync(root, { force: true, recursive: true })
    }
})

describe('module architecture structure', () => {
    it('accepts a compliant module with only the layer it uses and ignores catalog AGENTS.md', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'domain/order.ts': 'export interface Order { readonly id: string }\n',
            },
        })

        const result = scanModuleArchitecture({ rootDir: fixture.rootDir })

        expect(result.modules).toEqual(['orders'])
        expect(result.violations).toEqual([])
    })

    it('ignores the exact Nest-generated Swagger aggregate after a build', () => {
        const fixture = new FixtureRepository().addModule('customers', {
            files: { 'api/customer.dto.ts': 'export class CustomerDto {}\n' },
        })
        fixture.addRootFile(
            'src/metadata.ts',
            "export default async () => ({ models: [[await import('./libs/modules/customers/src/api/customer.dto'), { CustomerDto: {} }]] })\n",
        )

        expect(scan(fixture)).toEqual([])
    })

    it.each(['src/other/metadata.ts', 'src/metadata-helper.ts', 'src/libs/common/src/metadata.ts'])(
        'still checks private module imports from %s',
        path => {
            const fixture = new FixtureRepository().addModule('customers', {
                files: { 'api/customer.dto.ts': 'export class CustomerDto {}\n' },
            })
            fixture.addRootFile(
                path,
                `export const metadata = import('${MODULE_ALIAS_PREFIX}customers/api/customer.dto')\n`,
            )

            expect(violationsFor(fixture, 'cross-module-public-api')).toEqual([
                expect.objectContaining({ source: path }),
            ])
        },
    )

    it('reports invalid names and missing module structure', () => {
        const fixture = new FixtureRepository()
            .addModule('Bad_Name')
            .addModule('missing-readme')
            .addModule('missing-src')
            .addModule('missing-barrel')
        fixture.removeModuleFile('missing-readme', 'README.md')
        fixture.removeModuleFile('missing-src', 'src')
        fixture.removeModuleFile('missing-barrel', 'src/index.ts')

        const ruleIds = new Set(scan(fixture).map(violation => violation.ruleId))

        expect(ruleIds.has('module-name')).toBe(true)
        expect(ruleIds.has('module-readme')).toBe(true)
        expect(ruleIds.has('module-src')).toBe(true)
        expect(ruleIds.has('module-barrel')).toBe(true)
    })

    it('reports catalog drift and missing standard README sections', () => {
        const fixture = new FixtureRepository().addModule('orders')
        fixture.setCatalog([])
        fixture.setModuleReadme('orders', '# Orders\n\n## Responsibility\n\nOrders.\n')

        const ruleIds = new Set(scan(fixture).map(violation => violation.ruleId))

        expect(ruleIds.has('module-catalog')).toBe(true)
        expect(ruleIds.has('module-readme-sections')).toBe(true)
    })

    it('ignores hidden and image catalog links and accepts a visible reference-style link', () => {
        const fixture = new FixtureRepository().addModule('orders')
        fixture.addRootFile(
            'src/libs/modules/README.md',
            [
                '# Modules Directory',
                '',
                '## Module Catalog',
                '',
                '<!-- - [`orders`](orders/README.md) -->',
                '',
                '```md',
                '- [`orders`](orders/README.md)',
                '```',
                '',
                '![orders][orders-module]',
                '',
                '[orders-module]: orders/README.md',
            ].join('\n'),
        )

        expect(violationsFor(fixture, 'module-catalog')).toHaveLength(1)

        fixture.addRootFile(
            'src/libs/modules/README.md',
            [
                '# Modules Directory',
                '',
                '## Module Catalog',
                '',
                '- [`orders`][orders-module]',
                '',
                '[orders-module]: orders/README.md',
            ].join('\n'),
        )

        expect(violationsFor(fixture, 'module-catalog')).toEqual([])
    })
})

describe('source placement', () => {
    it('allows the public barrel and matching root composition module', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'api/orders.controller.ts': 'export class OrdersController {}\n',
                'api/orders.dto.ts': 'export interface OrdersDto {}\n',
                'orders.module.ts': "import './api/orders.controller'\n",
            },
        })

        expect(violationsFor(fixture, 'source-placement')).toEqual([])
        expect(violationsFor(fixture, 'api-placement')).toEqual([])
    })

    it('rejects arbitrary root production files and a nonmatching root module', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
                'other.module.ts': 'export class OtherModule {}\n',
            },
        })

        expect(violationsFor(fixture, 'source-placement')).toHaveLength(2)
    })

    it('rejects production source in the module root outside src while exempting tests there', () => {
        const fixture = new FixtureRepository().addModule('orders')
        fixture.addRootFile('src/libs/modules/orders/outside-src.ts', 'export const outsideSrc = true\n')
        fixture.addRootFile('src/libs/modules/orders/outside-src.spec.ts', 'export const outsideSrcFixture = true\n')

        const violations = violationsFor(fixture, 'source-placement')
        expect(violations).toHaveLength(1)
        expect(violations[0].source).toBe('src/libs/modules/orders/outside-src.ts')
    })

    it('requires production controllers and DTOs to live under api', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'application/orders.controller.ts': 'export class OrdersController {}\n',
                'domain/orders.dto.ts': 'export interface OrdersDto {}\n',
            },
        })

        expect(violationsFor(fixture, 'api-placement')).toHaveLength(2)
    })

    it('exempts test files from placement rules', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'arbitrary.spec.ts': 'export const testFixture = true\n',
                'helpers/example.test.ts': 'export const testFixture = true\n',
            },
        })

        expect(violationsFor(fixture, 'source-placement')).toEqual([])
    })
})

describe('layer dependency direction', () => {
    const expectations: Readonly<Record<string, readonly string[]>> = {
        api: ['api', 'application', 'domain'],
        application: ['application', 'domain'],
        domain: ['domain'],
        infrastructure: ['infrastructure', 'application', 'domain'],
    }

    it.each(Object.keys(expectations).flatMap(source => Object.keys(expectations).map(target => ({ source, target }))))(
        '$source -> $target follows the dependency matrix',
        ({ source, target }) => {
            const relativeTarget = source === target ? './target' : `../${target}/target`
            const fixture = new FixtureRepository().addModule('orders', {
                files: {
                    [`${source}/source.ts`]: `import '${relativeTarget}'\n`,
                    [`${target}/target.ts`]: 'export const target = true\n',
                },
            })

            const expectedAllowed = expectations[source].includes(target)
            expect(violationsFor(fixture, 'layer-dependency')).toHaveLength(expectedAllowed ? 0 : 1)
        },
    )

    it.each(['api', 'application', 'domain', 'infrastructure'])('rejects %s imports of the module root', source => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                [`${source}/source.ts`]: "import '../index'\n",
            },
        })

        expect(violationsFor(fixture, 'layer-dependency')).toHaveLength(1)
    })

    it.each(['api', 'application', 'domain', 'infrastructure'])(
        'allows the root composition module to import %s',
        target => {
            const fixture = new FixtureRepository().addModule('orders', {
                files: {
                    [`${target}/target.ts`]: 'export const target = true\n',
                    'orders.module.ts': `import './${target}/target'\n`,
                },
            })

            expect(violationsFor(fixture, 'layer-dependency')).toEqual([])
        },
    )

    it('exempts tests from the layer dependency matrix', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'api/source.spec.ts': "import '../infrastructure/target'\n",
                'infrastructure/target.ts': 'export const target = true\n',
            },
        })

        expect(violationsFor(fixture, 'layer-dependency')).toEqual([])
    })
})

describe('technical dependencies', () => {
    const prohibitedSpecifiers = [
        '@automapper/classes',
        '@aws-sdk/client-s3',
        '@nestjs/common',
        '@paddle/paddle-node-sdk',
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
        '@tuposoft/lead-email-finder/catch-all',
        '@tuposoft/lead-email-finder/config',
        '@tuposoft/lead-email-finder/dns',
        '@tuposoft/lead-email-finder/key',
        '@tuposoft/lead-email-finder/redis',
        '@tuposoft/lead-email-finder/socket',
    ] as const

    it.each(['application', 'domain'])('rejects every prohibited prefix from %s', layer => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: Object.fromEntries(
                prohibitedSpecifiers.map((specifier, index) => [
                    `${layer}/source-${index}.ts`,
                    `import '${specifier}'\n`,
                ]),
            ),
        })

        const violations = violationsFor(fixture, 'technical-dependency')
        expect(violations).toHaveLength(prohibitedSpecifiers.length)
        expect(new Set(violations.map(violation => violation.target))).toEqual(new Set(prohibitedSpecifiers))
    })

    it.each(['api', 'infrastructure'])('allows technical packages from %s', layer => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                [`${layer}/source.ts`]: "import '@nestjs/common'\nimport 'typeorm'\n",
            },
        })

        expect(violationsFor(fixture, 'technical-dependency')).toEqual([])
    })

    it('allows shared contracts and bare public business-module barrels', () => {
        const fixture = new FixtureRepository().addModule('customers').addModule('orders', {
            dependencies: ['customers'],
            files: {
                'application/source.ts':
                    "import '@tuposoft/lead-email-finder/common'\n" +
                    "import '@tuposoft/lead-email-finder/modules/customers'\n",
            },
        })

        expect(violationsFor(fixture, 'technical-dependency')).toEqual([])
        expect(violationsFor(fixture, 'cross-module-public-api')).toEqual([])
    })
})

describe('import forms and module public boundaries', () => {
    it('scans every supported static, dynamic, CommonJS, and Jest import form', () => {
        const deep = `${MODULE_ALIAS_PREFIX}customers/domain/customer`
        const fixture = new FixtureRepository()
            .addModule('customers', {
                files: {
                    'domain/customer.ts':
                        'export const customer = true\nexport interface Customer { readonly id: string }\n',
                },
            })
            .addModule('orders', {
                files: {
                    'application/imports.ts': [
                        `import { customer } from '${deep}'`,
                        `import type { Customer } from '${deep}'`,
                        `type ImportedCustomer = import('${deep}').Customer`,
                        `export { customer as exportedCustomer } from '${deep}'`,
                        `import customerModule = require('${deep}')`,
                        `void import('${deep}')`,
                        `void require('${deep}')`,
                        `jest.mock('${deep}')`,
                        `jest.mock(\`${deep}\`)`,
                        `jest.doMock('${deep}')`,
                        `jest.unmock('${deep}')`,
                        `jest.dontMock('${deep}')`,
                        `jest.setMock('${deep}', {})`,
                        `jest.deepUnmock('${deep}')`,
                        `jest.createMockFromModule('${deep}')`,
                        `jest.genMockFromModule('${deep}')`,
                        `jest['mock']('${deep}')`,
                        `jest.requireActual('${deep}')`,
                        `jest.requireMock('${deep}')`,
                        'void customer',
                        'void customerModule',
                    ].join('\n'),
                },
            })

        const violations = violationsFor(fixture, 'cross-module-public-api')
        expect(violations).toHaveLength(19)
        expect(new Set(violations.map(violation => violation.target))).toEqual(new Set([deep]))
    })

    it('rejects deep alias, relative, and test imports across module boundaries', () => {
        const fixture = new FixtureRepository()
            .addModule('customers', {
                files: {
                    'domain/customer.ts': 'export const customer = true\n',
                },
            })
            .addModule('orders', {
                files: {
                    'application/deep.ts': `import '${MODULE_ALIAS_PREFIX}customers/domain/customer'\n`,
                    'application/relative.ts': "import '../../../customers/src/domain/customer'\n",
                    'cross-module.spec.ts': `import '${MODULE_ALIAS_PREFIX}customers/domain/customer'\n`,
                },
            })

        expect(violationsFor(fixture, 'cross-module-public-api')).toHaveLength(3)
    })

    it('allows bare external barrels and internal deep aliases', () => {
        const fixture = new FixtureRepository().addModule('customers').addModule('orders', {
            dependencies: ['customers'],
            files: {
                'domain/order.ts': 'export const order = true\n',
                'application/source.ts':
                    `import '${MODULE_ALIAS_PREFIX}customers'\n` +
                    `import '${MODULE_ALIAS_PREFIX}orders/domain/order'\n`,
            },
        })

        expect(violationsFor(fixture, 'cross-module-public-api')).toEqual([])
    })

    it('rejects an alternate tsconfig alias that resolves into another module', () => {
        const fixture = new FixtureRepository()
            .addModule('customers', {
                files: {
                    'domain/customer.ts': 'export const customer = true\n',
                },
            })
            .addModule('orders', {
                dependencies: ['customers'],
                files: {
                    'application/source.ts': "import '@fixture/customer-internal'\n",
                },
            })
            .setPathMapping('@fixture/customer-internal', ['src/libs/modules/customers/src/domain/customer.ts'])

        const violations = violationsFor(fixture, 'cross-module-public-api')
        expect(violations).toHaveLength(1)
        expect(violations[0].target).toBe('@fixture/customer-internal')
    })

    it('stops when a canonical business-module alias resolves outside its named module', () => {
        const fixture = new FixtureRepository()
            .addModule('customers')
            .addModule('orders', {
                files: {
                    'application/source.ts': `import '${MODULE_ALIAS_PREFIX}customers'\n`,
                },
            })
            .setPathMapping(`${MODULE_ALIAS_PREFIX}customers`, ['src/libs/common/src/index.ts'])

        expect(() => scan(fixture)).toThrow(/resolved outside module "customers"/i)
    })

    it('allows own relative barrel exports and rejects external or nonrelative exports', () => {
        const fixture = new FixtureRepository()
            .addModule('customers', {
                files: {
                    'domain/customer.ts': 'export const customer = true\n',
                },
            })
            .addModule('orders', {
                dependencies: ['customers'],
                files: {
                    'domain/order.ts': 'export const order = true\n',
                },
            })
        fixture.writeModuleFile(
            'orders',
            'index.ts',
            [
                "export * from './domain/order'",
                "export * from '../../customers/src/domain/customer'",
                `export * from '${MODULE_ALIAS_PREFIX}customers'`,
                `export import Customers = require('${MODULE_ALIAS_PREFIX}customers')`,
                `export = require('${MODULE_ALIAS_PREFIX}customers')`,
                `export default import('${MODULE_ALIAS_PREFIX}customers')`,
            ].join('\n'),
        )

        expect(violationsFor(fixture, 'barrel-escape')).toHaveLength(5)
    })

    it('rejects external bindings that a barrel exports through local declarations', () => {
        const customers = `${MODULE_ALIAS_PREFIX}customers`
        const fixture = new FixtureRepository()
            .addModule('customers')
            .addModule('orders', { dependencies: ['customers'] })
        fixture.writeModuleFile(
            'orders',
            'index.ts',
            [
                `import { customer } from '${customers}'`,
                `import defaultCustomer from '${customers}'`,
                `import CustomerModule = require('${customers}')`,
                'export { customer, CustomerModule }',
                'export default defaultCustomer',
                `export const Direct = require('${customers}')`,
                `export const Dynamic = import('${customers}')`,
            ].join('\n'),
        )

        expect(violationsFor(fixture, 'barrel-escape')).toHaveLength(5)
    })

    it('rejects direct top-level CommonJS assignments that export another module', () => {
        const customers = `${MODULE_ALIAS_PREFIX}customers`
        const fixture = new FixtureRepository()
            .addModule('customers')
            .addModule('orders', { dependencies: ['customers'] })
        fixture.writeModuleFile(
            'orders',
            'index.ts',
            [`module.exports = require('${customers}')`, `exports.Customers = require('${customers}')`].join('\n'),
        )

        expect(violationsFor(fixture, 'barrel-escape')).toHaveLength(2)
    })
})

describe('documented dependencies and cycles', () => {
    it('requires production module edges to be documented but permits extra capability dependencies', () => {
        const fixture = new FixtureRepository()
            .addModule('customers')
            .addModule('payments')
            .addModule('orders', {
                dependencies: ['payments'],
                files: {
                    'application/source.ts': `import '${MODULE_ALIAS_PREFIX}customers'\n`,
                },
            })

        const violations = violationsFor(fixture, 'undocumented-dependency')
        expect(violations).toHaveLength(1)
        expect(violations[0].target).toBe('customers')
    })

    it('ignores dependency links in comments, code, and images but accepts reference links', () => {
        const fixture = new FixtureRepository().addModule('customers').addModule('orders', {
            files: {
                'application/source.ts': `import '${MODULE_ALIAS_PREFIX}customers'\n`,
            },
        })
        fixture.setModuleReadme(
            'orders',
            moduleReadme('orders').replace(
                '## Dependencies\n\nNone.',
                [
                    '## Dependencies',
                    '',
                    '<!-- - [`customers`](../customers/README.md) -->',
                    '',
                    '```md',
                    '- [`customers`](../customers/README.md)',
                    '```',
                    '',
                    '    - [`customers`](../customers/README.md)',
                    '',
                    '![customers](../customers/README.md)',
                    '',
                    '![customers][customers-module]',
                    '',
                    '[customers-module]: ../customers/README.md',
                ].join('\n'),
            ),
        )

        expect(violationsFor(fixture, 'undocumented-dependency')).toHaveLength(1)

        fixture.setModuleReadme(
            'orders',
            moduleReadme('orders').replace(
                '## Dependencies\n\nNone.',
                [
                    '## Dependencies',
                    '',
                    '- [`customers`][customers-module]',
                    '',
                    '[customers-module]: ../customers/README.md',
                ].join('\n'),
            ),
        )

        expect(violationsFor(fixture, 'undocumented-dependency')).toEqual([])
    })

    it('accepts a visible nested dependency link but ignores one in a multiline code span', () => {
        const fixture = new FixtureRepository().addModule('customers').addModule('orders', {
            files: {
                'application/source.ts': `import '${MODULE_ALIAS_PREFIX}customers'\n`,
            },
        })
        fixture.setModuleReadme(
            'orders',
            moduleReadme('orders').replace(
                '## Dependencies\n\nNone.',
                ['## Dependencies', '', '- Runtime:', '    - [`customers`](../customers/README.md)'].join('\n'),
            ),
        )

        expect(violationsFor(fixture, 'undocumented-dependency')).toEqual([])

        fixture.setModuleReadme(
            'orders',
            moduleReadme('orders').replace(
                '## Dependencies\n\nNone.',
                ['## Dependencies', '', '`Example only:', '- [customers](../customers/README.md)', '`'].join('\n'),
            ),
        )

        expect(violationsFor(fixture, 'undocumented-dependency')).toHaveLength(1)
    })

    it('does not accept required README headings hidden in comments or code fences', () => {
        const fixture = new FixtureRepository().addModule('orders')
        fixture.setModuleReadme(
            'orders',
            moduleReadme('orders')
                .replace('## Responsibility', '<!-- ## Responsibility -->')
                .replace('## Non-Responsibilities', '```md\n## Non-Responsibilities\n```'),
        )

        const violations = violationsFor(fixture, 'module-readme-sections')
        expect(new Set(violations.map(violation => violation.target))).toEqual(
            new Set(['Responsibility', 'Non-Responsibilities']),
        )
    })

    it('reports one stable, sorted key for each cyclic strongly connected component', () => {
        const fixture = new FixtureRepository()
            .addModule('zebra', {
                dependencies: ['alpha'],
                files: {
                    'application/source.ts': `import '${MODULE_ALIAS_PREFIX}alpha'\n`,
                },
            })
            .addModule('alpha', {
                dependencies: ['zebra'],
                files: {
                    'application/source.ts': `import '${MODULE_ALIAS_PREFIX}zebra'\n`,
                },
            })

        const violations = violationsFor(fixture, 'module-cycle')
        expect(violations).toHaveLength(1)
        expect(violations[0].key).toContain('alpha')
        expect(violations[0].key).toContain('zebra')
        expect(violations[0].key.indexOf('alpha')).toBeLessThan(violations[0].key.indexOf('zebra'))
    })
})

describe('stable violation identity and hard failures', () => {
    it('keeps keys stable across line movement and distinguishes duplicate occurrences', () => {
        const deep = `${MODULE_ALIAS_PREFIX}customers/domain/customer`
        const fixture = new FixtureRepository()
            .addModule('customers', {
                files: {
                    'domain/customer.ts': 'export const customer = true\n',
                },
            })
            .addModule('orders', {
                files: {
                    'application/source.ts': `void require('${deep}')\nvoid require('${deep}')\n`,
                },
            })

        const before = violationsFor(fixture, 'cross-module-public-api').map(violation => violation.key)
        fixture.writeModuleFile(
            'orders',
            'application/source.ts',
            `\n\nvoid require('${deep}')\nvoid require('${deep}')\n`,
        )
        const after = violationsFor(fixture, 'cross-module-public-api').map(violation => violation.key)

        expect(before).toHaveLength(2)
        expect(new Set(before).size).toBe(2)
        expect(after).toEqual(before)
        expect(before.join('\n')).not.toMatch(/:\d+:\d+/)
    })

    it('stops on malformed TypeScript', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'domain/order.ts': 'export const =\n',
            },
        })

        expect(() => scan(fixture)).toThrow(/parse|syntax|TypeScript/i)
    })

    it('stops when a relative import needed for a boundary decision cannot resolve', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'application/source.ts': "import '../domain/missing'\n",
            },
        })

        expect(() => scan(fixture)).toThrow(/resolve|missing/i)
    })
})

describe('baseline format and exact comparison', () => {
    it('serializes sorted unique versioned keys and parses them', () => {
        const firstKey = 'source-placement|src/libs/modules/orders/src/helper.ts|helper.ts'
        const secondKey = 'technical-dependency|src/libs/modules/orders/src/domain/order.ts|typeorm'
        const serialized = serializeBaseline([secondKey, firstKey, firstKey])

        expect(serialized).toBe(
            `{\n    "schemaVersion": 1,\n    "violations": [\n        "${firstKey}",\n        "${secondKey}"\n    ]\n}\n`,
        )
        expect(parseBaseline(serialized).violations).toEqual([firstKey, secondKey])
    })

    it.each([
        ['unknown schema', '{"schemaVersion":2,"violations":[]}'],
        ['malformed entry', '{"schemaVersion":1,"violations":[42]}'],
        ['malformed key', '{"schemaVersion":1,"violations":["not-a-stable-key"]}'],
        [
            'duplicate entry',
            '{"schemaVersion":1,"violations":["module-src|src/libs/modules/orders|src","module-src|src/libs/modules/orders|src"]}',
        ],
        [
            'incorrect order',
            '{"schemaVersion":1,"violations":["technical-dependency|source.ts|typeorm","source-placement|source.ts|helper.ts"]}',
        ],
        ['malformed JSON', '{'],
    ])('rejects %s', (_description, input) => {
        expect(() => parseBaseline(input, 'fixture-baseline.json')).toThrow()
    })

    it('reports both current-only and baseline-only keys', () => {
        const current: ArchitectureViolation[] = [
            {
                key: 'new-key',
                message: 'new violation',
                ruleId: 'source-placement',
                source: 'source.ts',
            },
            {
                key: 'shared-key',
                message: 'shared violation',
                ruleId: 'source-placement',
                source: 'source.ts',
            },
        ]

        const comparison = compareViolationSets(current, ['shared-key', 'stale-key'])

        expect(comparison.matches).toBe(false)
        expect(comparison.currentOnly.map(violation => violation.key)).toEqual(['new-key'])
        expect(comparison.baselineOnly).toEqual(['stale-key'])
    })
})

describe('architecture CLI ratchet', () => {
    it('creates an initial baseline and is byte-idempotent when repeated', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })

        const first = runCli(fixture, ['--write-baseline'])
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        const second = runCli(fixture, ['--write-baseline'])
        const after = readFileSync(baselinePath, 'utf8')

        expect(first.code).toBe(0)
        expect(first.stdout).toContain('Created architecture baseline')
        expect(second.code).toBe(0)
        expect(after).toBe(before)
        expect(runCli(fixture).code).toBe(0)
    })

    it('fails on stale entries until the updater shrinks the baseline', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        fixture.removeModuleFile('orders', 'src/helper.ts')

        const stale = runCli(fixture)
        const update = runCli(fixture, ['--write-baseline'])

        expect(stale.code).toBe(1)
        expect(stale.stderr).toContain('  source-placement:\n    [STALE]')
        expect(update.code).toBe(0)
        expect(update.stdout).toContain('Shrank architecture baseline')
        expect(runCli(fixture).code).toBe(0)
    })

    it('reports new debt and refuses baseline growth', () => {
        const fixture = new FixtureRepository().addModule('orders')
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        fixture.writeModuleFile('orders', 'helper.ts', 'export const helper = true\n')

        const check = runCli(fixture)
        const update = runCli(fixture, ['--write-baseline'])

        expect(check.code).toBe(1)
        expect(check.stderr).toContain('[NEW]')
        expect(update.code).toBe(1)
        expect(update.stderr).toContain('Refusing to grow')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('allows bootstrap when the base commit predates the baseline', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        initializeGit(fixture)
        const baseSha = git(fixture, ['rev-parse', 'HEAD'])

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(0)
        expect(result.stderr).toContain('allowing bootstrap')
    })

    it('reconciles violations already present at the first baseline commit', () => {
        const { baseSha, fixture } = createAdoptionFixture()
        const environment = { ARCHITECTURE_BASE_SHA: baseSha }
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        fixture.addRootFile('scripts/architecture/check-module-architecture.ts', 'export const fixtureCliVersion = 2\n')
        fixture.addRootFile(
            'scripts/architecture/module-architecture.spec.ts',
            'export const fixtureSpecificationVersion = 2\n',
        )
        fixture.addRootFile(
            '.agents/plans/module-architecture-reconciliation/README.md',
            '# Fixture reconciliation plan\n',
        )
        git(fixture, [
            'add',
            'scripts/architecture/check-module-architecture.ts',
            'scripts/architecture/module-architecture.spec.ts',
        ])

        const beforeUpdate = runCli(fixture, [], environment)
        const reconciliation = runCli(fixture, ['--write-baseline'], environment)
        const reconciledContents = readFileSync(baselinePath, 'utf8')
        const repeated = runCli(fixture, ['--write-baseline'], environment)

        expect(beforeUpdate.code).toBe(1)
        expect(beforeUpdate.stderr).toContain('[NEW]')
        expect(reconciliation.code).toBe(0)
        expect(reconciliation.stdout).toContain('Reconciled architecture baseline adoption')
        expect(parseBaseline(reconciledContents).violations).toEqual(scan(fixture).map(violation => violation.key))
        expect(repeated.code).toBe(0)
        expect(repeated.stdout).toContain('already current')
        expect(readFileSync(baselinePath, 'utf8')).toBe(reconciledContents)
        expect(runCli(fixture).code).toBe(0)
        expect(runCli(fixture, [], environment).code).toBe(0)
    })

    it('rejects reconciliation for a violation sourced from an allowed changed TypeScript file', () => {
        const { baseSha, fixture } = createAdoptionFixture()
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        fixture.addRootFile(
            'scripts/architecture/module-architecture.spec.ts',
            "import '@tuposoft/lead-email-finder/modules/orders/helper'\n",
        )
        git(fixture, ['add', 'scripts/architecture/module-architecture.spec.ts'])

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('requires the current baseline file to exist for adoption reconciliation', () => {
        const { baseSha, fixture } = createAdoptionFixture()
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        unlinkSync(baselinePath)

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('requires the current architecture baseline file to exist')
        expect(existsSync(baselinePath)).toBe(false)
    })

    it('rejects adoption reconciliation when the base parent already contains a baseline', () => {
        const { fixture } = createAdoptionFixture()
        fixture.addRootFile('reconciliation-note.txt', 'later change\n')
        const laterBaseSha = commitFixture(fixture, 'later baseline commit')
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: laterBaseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects adoption reconciliation when a baseline existed earlier in the parent ancestry', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        fixture.addRootFile('scripts/architecture/module-architecture.ts', 'export const fixtureScannerVersion = 1\n')
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))
        initializeGit(fixture)
        unlinkSync(join(fixture.rootDir, BASELINE_RELATIVE_PATH))
        commitFixture(fixture, 'delete architecture baseline')
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))
        const recreatedBaseSha = commitFixture(fixture, 'recreate architecture baseline')
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: recreatedBaseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects adoption reconciliation when a merge parent already contains a baseline', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        fixture.addRootFile('scripts/architecture/module-architecture.ts', 'export const fixtureScannerVersion = 1\n')
        initializeGit(fixture)
        const initialSha = git(fixture, ['rev-parse', 'HEAD'])
        git(fixture, ['checkout', '--quiet', '-b', 'baseline-side'])
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))
        const baselineSideSha = commitFixture(fixture, 'adopt baseline on merge side')
        git(fixture, ['checkout', '--quiet', '-b', 'first-parent', initialSha])
        fixture.addRootFile('first-parent-note.txt', 'first parent\n')
        commitFixture(fixture, 'advance first parent')
        git(fixture, ['merge', '--quiet', '--no-ff', '-m', 'merge baseline side', baselineSideSha])
        const mergeBaseSha = git(fixture, ['rev-parse', 'HEAD'])
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: mergeBaseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects adoption reconciliation when the configured base is not an ancestor of HEAD', () => {
        const { baseSha, fixture } = createAdoptionFixture()
        const firstParentSha = git(fixture, ['rev-parse', `${baseSha}^1`])
        git(fixture, ['checkout', '--quiet', '-b', 'sibling-adoption', firstParentSha])
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))
        commitFixture(fixture, 'adopt baseline on sibling')
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects adoption reconciliation that would replace stale base entries with additions', () => {
        const staleKey = 'source-placement|src/libs/modules/orders/src/stale.ts|stale.ts'
        const { baseSha, fixture } = createAdoptionFixture([staleKey])
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it.each([
        [
            'module source',
            (fixture: FixtureRepository) =>
                fixture.writeModuleFile(
                    'orders',
                    'helper.ts',
                    'export const helper = true\nexport const changed = true\n',
                ),
        ],
        [
            'TypeScript configuration',
            (fixture: FixtureRepository) => {
                const tsconfigPath = join(fixture.rootDir, 'tsconfig.json')
                fixture.addRootFile('tsconfig.json', `${readFileSync(tsconfigPath, 'utf8')}\n`)
            },
        ],
        [
            'core scanner',
            (fixture: FixtureRepository) =>
                fixture.addRootFile(
                    'scripts/architecture/module-architecture.ts',
                    'export const fixtureScannerVersion = 2\n',
                ),
        ],
        [
            'TypeScript source outside the module directory',
            (fixture: FixtureRepository) =>
                fixture.addRootFile('src/outside-architecture-input.ts', 'export const outsideInput = true\n'),
        ],
        [
            'new ignored TypeScript source',
            (fixture: FixtureRepository) =>
                fixture.addRootFile('src/ignored-architecture-input.ts', 'export const ignoredInput = true\n'),
        ],
    ])('rejects adoption reconciliation after a %s change', (_description, changeInput) => {
        const { baseSha, fixture } = createAdoptionFixture()
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        changeInput(fixture)
        git(fixture, ['add', '.'])

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects adoption reconciliation with an ordinary untracked file outside the allowed paths', () => {
        const { baseSha, fixture } = createAdoptionFixture()
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        fixture.addRootFile('untracked-note.txt', 'unrelated work\n')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('fails closed when a baseline-bearing base commit has no first parent', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        fixture.addRootFile('scripts/architecture/module-architecture.ts', 'export const fixtureScannerVersion = 1\n')
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))
        initializeGit(fixture)
        const baseSha = git(fixture, ['rev-parse', 'HEAD'])

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: baseSha,
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('first parent')
    })

    it('rejects deletion and recreation that grows the baseline relative to the base commit', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        initializeGit(fixture)
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        const baseSha = commitFixture(fixture, 'adopt architecture baseline')
        fixture.writeModuleFile('orders', 'another.ts', 'export const another = true\n')
        const currentKeys = scan(fixture).map(violation => violation.key)
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline(currentKeys))

        const result = runCli(fixture, [], { ARCHITECTURE_BASE_SHA: baseSha })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
    })

    it('rejects recreation after the base commit deleted a previously adopted baseline', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: {
                'helper.ts': 'export const helper = true\n',
            },
        })
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        initializeGit(fixture)
        unlinkSync(join(fixture.rootDir, BASELINE_RELATIVE_PATH))
        git(fixture, ['add', '--update'])
        git(fixture, ['commit', '--quiet', '-m', 'delete architecture baseline'])
        const deletionSha = git(fixture, ['rev-parse', 'HEAD'])
        fixture.writeModuleFile('orders', 'another.ts', 'export const another = true\n')
        write(
            join(fixture.rootDir, BASELINE_RELATIVE_PATH),
            serializeBaseline(scan(fixture).map(violation => violation.key)),
        )

        const result = runCli(fixture, [], { ARCHITECTURE_BASE_SHA: deletionSha })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('[BASELINE GROWTH]')
    })

    it('skips only cross-revision comparison when the base commit is unavailable', () => {
        const fixture = new FixtureRepository().addModule('orders')
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)

        const result = runCli(fixture, [], {
            ARCHITECTURE_BASE_SHA: '1234567890123456789012345678901234567890',
        })

        expect(result.code).toBe(0)
        expect(result.stderr).toContain('base commit')
        expect(result.stderr).toContain('unavailable')
    })

    it('does not allow an unavailable base to grow the baseline updater', () => {
        const fixture = new FixtureRepository().addModule('orders')
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        const baselinePath = join(fixture.rootDir, BASELINE_RELATIVE_PATH)
        const before = readFileSync(baselinePath, 'utf8')
        fixture.writeModuleFile('orders', 'helper.ts', 'export const helper = true\n')

        const result = runCli(fixture, ['--write-baseline'], {
            ARCHITECTURE_BASE_SHA: '1234567890123456789012345678901234567890',
        })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('unavailable')
        expect(result.stderr).toContain('Refusing to grow')
        expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    })

    it('rejects a malformed current baseline and unknown CLI arguments', () => {
        const fixture = new FixtureRepository().addModule('orders')
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), '{')

        expect(runCli(fixture).code).toBe(1)
        const usage = runCli(fixture, ['--grow-baseline'])
        expect(usage.code).toBe(1)
        expect(usage.stderr).toContain('Usage:')
    })

    it('fails closed when the baseline at an available base commit is malformed', () => {
        const fixture = new FixtureRepository().addModule('orders')
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), '{')
        initializeGit(fixture)
        const baseSha = git(fixture, ['rev-parse', 'HEAD'])
        write(join(fixture.rootDir, BASELINE_RELATIVE_PATH), serializeBaseline([]))

        const result = runCli(fixture, [], { ARCHITECTURE_BASE_SHA: baseSha })

        expect(result.code).toBe(1)
        expect(result.stderr).toContain(`${baseSha}:${BASELINE_RELATIVE_PATH}`)
        expect(result.stderr).toContain('not valid JSON')
    })

    it('reads a base baseline with git show through the repository fixture', () => {
        const fixture = new FixtureRepository().addModule('orders')
        expect(runCli(fixture, ['--write-baseline']).code).toBe(0)
        initializeGit(fixture)
        const baseSha = git(fixture, ['rev-parse', 'HEAD'])
        const stderr = captureText()

        const keys = readBaseBaseline(fixture.rootDir, { ARCHITECTURE_BASE_SHA: baseSha }, stderr.writer)

        expect(keys).toEqual([])
        expect(stderr.value()).toBe('')
    })
})
