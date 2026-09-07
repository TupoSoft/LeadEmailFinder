import assert from 'node:assert/strict'
import {
    chmodSync,
    existsSync,
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { assertDevelopmentMetadataPath, loadDevelopmentStack } from './development-stack.mjs'

const safeError = /Development stack metadata must use a private regular file inside this checkout\./

function checkout(t) {
    const root = mkdtempSync(join(tmpdir(), 'lef-stack-path-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    return root
}

function metadataFile(root) {
    mkdirSync(join(root, '.dev/keycloak'), { recursive: true })
    const file = join(root, '.dev/keycloak/development-stack.json')
    writeFileSync(file, '{}', { mode: 0o600 })
    return file
}

test('allows missing metadata without creating directories or files', t => {
    const root = checkout(t)
    assert.equal(assertDevelopmentMetadataPath(root), join(root, '.dev/keycloak/development-stack.json'))
    assert.equal(existsSync(join(root, '.dev')), false)
})

test('requires a canonical checkout directory and a private regular metadata file', t => {
    const root = checkout(t)
    const file = metadataFile(root)
    assert.equal(assertDevelopmentMetadataPath(root), file)
    assert.throws(() => assertDevelopmentMetadataPath(`${root}/../${root.split('/').at(-1)}`), safeError)
    assert.throws(() => assertDevelopmentMetadataPath(file), safeError)
    chmodSync(file, 0o644)
    assert.throws(() => assertDevelopmentMetadataPath(root), safeError)
})

for (const component of ['checkout', '.dev', '.dev/keycloak']) {
    test(`rejects a symbolic link in the ${component} directory before reading metadata`, t => {
        const root = checkout(t)
        metadataFile(root)
        if (component === 'checkout') {
            const linked = join(root, 'linked')
            symlinkSync(root, linked, 'dir')
            assert.throws(() => loadDevelopmentStack(linked, { persistMetadata: false }), safeError)
            return
        }
        const directory = join(root, component)
        const target = `${directory}-outside`
        renameSync(directory, target)
        symlinkSync(target, directory, 'dir')
        assert.throws(() => loadDevelopmentStack(root, { persistMetadata: false }), safeError)
        assert.throws(() => loadDevelopmentStack(root), safeError)
    })
}

for (const kind of ['symbolic', 'dangling', 'hard']) {
    test(`rejects a ${kind} metadata link before reading or modifying its target`, t => {
        const root = checkout(t)
        const file = metadataFile(root)
        const target = join(root, 'external.json')
        renameSync(file, target)
        if (kind === 'hard') linkSync(target, file)
        else symlinkSync(kind === 'dangling' ? join(root, 'missing') : target, file)
        assert.throws(() => loadDevelopmentStack(root, { persistMetadata: false }), safeError)
        assert.throws(() => loadDevelopmentStack(root), safeError)
        assert.equal(readFileSync(target, 'utf8'), '{}')
        assert.equal(statSync(target).mode & 0o777, 0o600)
    })
}

test('withholds malformed secret-bearing metadata from parser errors', t => {
    const root = checkout(t)
    const file = metadataFile(root)
    writeFileSync(file, '{"keycloakAdminPassword":"SyntheticPrivateMarker",')
    assert.throws(() => loadDevelopmentStack(root, { persistMetadata: false }), error => {
        assert.match(error.message, safeError)
        assert.ok(!error.stack.includes('SyntheticPrivateMarker'))
        assert.equal(error.cause, undefined)
        return true
    })
})

function syntheticDocker(t, root) {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    mkdirSync(join(root, 'docker/secrets'), { recursive: true })
    const password = join(root, 'docker/secrets/postgres_password.txt')
    writeFileSync(password, 'synthetic-password', { mode: 0o600 })
    const services = ['api', 'web', 'postgres', 'redis', 'keycloak']
    const containers = Object.fromEntries(services.map((service, index) => {
        const id = `${index + 1}`.repeat(64)
        const container = {
            Config: {
                Labels: {
                    'com.docker.compose.project': 'lef',
                    'com.docker.compose.service': service,
                    'com.docker.compose.project.working_dir': root,
                    'com.docker.compose.project.config_files': join(root, 'docker/compose.yaml'),
                },
                Env: service === 'postgres' ? ['POSTGRES_USER=postgres', 'POSTGRES_DB=lef']
                    : service === 'keycloak' ? ['KC_BOOTSTRAP_ADMIN_USERNAME=admin', 'KC_BOOTSTRAP_ADMIN_PASSWORD=synthetic-admin-password'] : [],
            },
            State: { Running: true },
            Mounts: service === 'api' ? [{ Type: 'bind', Source: root, Destination: '/app' }]
                : service === 'postgres' ? [{ Type: 'bind', Source: password, Destination: '/run/secrets/postgres_password' }] : [],
            NetworkSettings: {
                Ports: {
                    '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: service === 'keycloak' ? '58080' : '53000' }],
                    '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }],
                    '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '56379' }],
                },
            },
        }
        return [id, container]
    }))
    const stateFile = join(root, 'containers.json')
    writeFileSync(stateFile, JSON.stringify(containers))
    writeFileSync(join(bin, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const containers = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
const args = process.argv.slice(2);
if (args[0] === 'ps') {
    const filter = args.find(value => value.startsWith('label=com.docker.compose.service='));
    const service = filter.slice(filter.lastIndexOf('=') + 1);
    const id = Object.keys(containers).find(key => containers[key].Config.Labels['com.docker.compose.service'] === service);
    process.stdout.write(id);
} else if (args[0] === 'inspect') {
    process.stdout.write(JSON.stringify([containers[args[1]]]));
} else process.exit(1);
`, { mode: 0o700 })
    const oldPath = process.env.PATH
    const oldProject = process.env.COMPOSE_PROJECT_NAME
    process.env.PATH = `${bin}:${oldPath}`
    delete process.env.COMPOSE_PROJECT_NAME
    t.after(() => {
        process.env.PATH = oldPath
        if (oldProject === undefined) delete process.env.COMPOSE_PROJECT_NAME
        else process.env.COMPOSE_PROJECT_NAME = oldProject
    })
}

test('read-only discovery validates owned services without writing provider secrets or metadata directories', t => {
    const root = checkout(t)
    syntheticDocker(t, root)
    const metadata = loadDevelopmentStack(root, { persistMetadata: false })
    assert.equal(metadata.apiUrl, 'http://localhost:53000')
    assert.equal(metadata.keycloakUrl, 'http://localhost:58080')
    assert.equal(existsSync(join(root, '.dev')), false)
})

test('read-only discovery leaves existing metadata bytes, permissions, and modification time unchanged', t => {
    const root = checkout(t)
    syntheticDocker(t, root)
    const metadata = loadDevelopmentStack(root)
    const file = join(root, '.dev/keycloak/development-stack.json')
    const before = readFileSync(file, 'utf8')
    const beforeStat = statSync(file)
    assert.deepEqual(loadDevelopmentStack(root, { persistMetadata: false }), metadata)
    const afterStat = statSync(file)
    assert.equal(readFileSync(file, 'utf8'), before)
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs)
    assert.equal(afterStat.mode, beforeStat.mode)
    assert.equal(afterStat.mode & 0o777, 0o600)
})
