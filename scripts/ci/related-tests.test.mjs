import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { discoverRelatedTests } from './related-tests.mjs'
import { runUnitTests } from './test-affected.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageManager = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).packageManager

function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'lef-related-tests-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    return directory
}

function write(directory, path, source) {
    const destination = join(directory, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, source)
    return destination
}

test('backend related test discovery follows aliases, barrels, changed tests, and manual mocks without executing tests', { timeout: 60_000 }, async t => {
    const directory = fixture(t)
    write(directory, 'package.json', JSON.stringify({ private: true, packageManager }))
    symlinkSync(join(repository, 'node_modules'), join(directory, 'node_modules'), 'dir')
    write(directory, 'jest.config.cjs', `module.exports = {
        testEnvironment: 'node',
        testMatch: ['<rootDir>/src/**/*.spec.js'],
        moduleNameMapper: { '^@fixture/shared$': '<rootDir>/src/shared/index.js' },
    }`)
    const value = write(directory, 'src/shared/value with spaces.js', 'exports.value = 1')
    const barrel = write(directory, 'src/shared/index.js', "module.exports = require('./value with spaces')")
    write(directory, 'src/service.js', "module.exports = require('@fixture/shared')")
    const dependent = write(directory, 'src/service.spec.js', `require('./service')
        throw new Error('Test modules must not execute during discovery')`)
    const mockTarget = write(directory, 'src/mocked.js', 'exports.value = 1')
    const manualMock = write(directory, 'src/__mocks__/mocked.js', 'exports.value = 2')
    const mockConsumer = write(directory, 'src/mock-consumer.spec.js', `jest.mock('./mocked')
        require('./mocked')
        throw new Error('Mock consumers must not execute during discovery')`)
    const orphan = write(directory, 'src/orphan.js', 'exports.value = 3')

    const related = await discoverRelatedTests('backend', [value, barrel, dependent, mockTarget, manualMock, orphan], directory)
    assert.deepEqual(related.get(value), [dependent])
    assert.deepEqual(related.get(barrel), [dependent])
    assert.deepEqual(related.get(dependent), [dependent])
    assert.deepEqual(related.get(mockTarget), [mockConsumer])
    assert.deepEqual(related.get(manualMock), [mockConsumer])
    assert.deepEqual(related.get(orphan), [])
})

test('web related test discovery follows aliases and barrels and keeps each input independent without executing tests', { timeout: 60_000 }, async t => {
    const directory = fixture(t)
    const originalEnvironment = { ...process.env }
    t.after(() => {
        for (const key of Object.keys(process.env)) {
            if (!Object.hasOwn(originalEnvironment, key)) delete process.env[key]
        }
        Object.assign(process.env, originalEnvironment)
    })
    delete process.env.NODE_ENV
    delete process.env.LEF_RELATED_FIXTURE_ADDED
    process.env.LEF_RELATED_FIXTURE_CHANGED = 'original'
    const environmentBeforeDiscovery = { ...process.env }
    const webRoot = join(directory, 'apps/web')
    write(directory, 'apps/web/package.json', JSON.stringify({ private: true, type: 'module' }))
    symlinkSync(join(repository, 'apps/web/node_modules'), join(webRoot, 'node_modules'), 'dir')
    write(directory, 'apps/web/vitest.config.ts', `process.env.LEF_RELATED_FIXTURE_ADDED = 'temporary'
        process.env.LEF_RELATED_FIXTURE_CHANGED = 'temporary'
        export default {
        resolve: { alias: { '@fixture/shared': ${JSON.stringify(join(webRoot, 'src/shared/index.ts'))} } },
        test: { environment: 'node', include: ['src/**/*.test.ts'] },
    }`)
    const value = write(webRoot, 'src/shared/value with spaces.ts', 'export const value = 1')
    const barrel = write(webRoot, 'src/shared/index.ts', "export { value } from './value with spaces'")
    write(webRoot, 'src/service.ts', "export { value } from '@fixture/shared'")
    const dependent = write(webRoot, 'src/service.test.ts', `import { value } from './service'
        throw new Error('Test modules must not execute during discovery: ' + value)`)
    const orphan = write(webRoot, 'src/orphan.ts', 'export const value = 2')

    const related = await discoverRelatedTests('web', [value, barrel, dependent, orphan, value], directory)
    assert.deepEqual({ ...process.env }, environmentBeforeDiscovery)
    assert.deepEqual(related.get(value), [dependent])
    assert.deepEqual(related.get(barrel), [dependent])
    assert.deepEqual(related.get(dependent), [dependent])
    assert.deepEqual(related.get(orphan), [])
})

test('web execution passes selected files through the installed Vitest CLI parser', async () => {
    const requireFromWeb = createRequire(join(repository, 'apps/web/package.json'))
    const { parseCLI } = await import(pathToFileURL(requireFromWeb.resolve('vitest/node')).href)
    const tests = [
        'apps/web/src/features/auth/destination.test.ts',
        'apps/web/tests/support/browser-fixture-guard.test.ts',
    ]
    let invocations = 0
    const status = runUnitTests({ suite: 'web', mode: 'related', tests }, repository, (command, args) => {
        invocations += 1
        assert.equal(command, 'corepack')
        const vitestIndex = args.indexOf('vitest')
        assert.notEqual(vitestIndex, -1)
        const parsed = parseCLI(args.slice(vitestIndex))
        assert.deepEqual(parsed.filter, tests.map(path => resolve(repository, path)))
        assert.equal(parsed.options.run, true)
        assert.equal(parsed.options.maxWorkers, 1)
        return { status: 0 }
    })
    assert.equal(status, 0)
    assert.equal(invocations, 1)
})
