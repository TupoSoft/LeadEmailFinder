import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { scanModuleArchitecture, type ArchitectureViolation } from './module-architecture'
import { runArchitectureCli } from './check-module-architecture'

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

function runCli(
    fixture: FixtureRepository,
    args: readonly string[] = [],
): { code: number; stderr: string; stdout: string } {
    const stdout = captureText()
    const stderr = captureText()
    const code = runArchitectureCli({
        args,
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


describe('architecture CLI', () => {
    it('passes when the repository fixture has zero violations', () => {
        const fixture = new FixtureRepository().addModule('orders', {
            files: { 'domain/order.ts': 'export interface Order { readonly id: string }\n' },
        })

        const result = runCli(fixture)

        expect(result.code).toBe(0)
        expect(result.stdout).toBe('Module architecture check passed (1 modules, 0 violations).\n')
        expect(result.stderr).toBe('')
    })

    it('fails with sorted, actionable diagnostics when a violation exists', () => {
        const fixture = new FixtureRepository().addModule('Orders')

        const result = runCli(fixture)

        expect(result.code).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('module-name:')
        expect(result.stderr).toContain('is not kebab-case')
    })

    it('rejects unknown CLI arguments', () => {
        const fixture = new FixtureRepository().addModule('orders')

        const result = runCli(fixture, ['--write-baseline'])

        expect(result.code).toBe(1)
        expect(result.stderr).toBe('Usage: architecture:check\n')
        expect(result.stdout).toBe('')
    })

    it('scans the actual repository checkout and expects zero violations', () => {
        const result = scanModuleArchitecture({ rootDir: resolve(__dirname, '../..') })

        expect(result.violations).toEqual([])
    })
})
