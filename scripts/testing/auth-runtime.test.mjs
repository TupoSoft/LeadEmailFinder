import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
    REQUIRED_AUTH_RUNTIME_TESTS,
    assertAuthRuntimeContainer,
    authRuntimeComposeFile,
    authRuntimeProjectName,
    loopbackBinding,
    passedAuthRuntimeTests,
    validateAuthRuntimeMetadata,
} from './auth-runtime.mjs'

const checkoutRoot = '/synthetic/checkout'
const metadata = {
    checkoutRoot,
    projectName: authRuntimeProjectName(checkoutRoot),
    composeFile: resolve(checkoutRoot, 'docker/compose.auth-runtime-test.yaml'),
    password: 'a'.repeat(64),
}

function report({ tests = REQUIRED_AUTH_RUNTIME_TESTS, extra = '', counts = {} } = {}) {
    const summary = { tests: tests.length, pass: tests.length, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...counts }
    return [
        'TAP version 13',
        ...tests.map((name, index) => `ok ${index + 1} - ${name}`),
        extra,
        ...Object.entries(summary).map(([key, value]) => `# ${key} ${value}`),
    ].join('\n')
}

test('names one stable disposable project per checkout', () => {
    assert.equal(authRuntimeProjectName(checkoutRoot), authRuntimeProjectName(checkoutRoot))
    assert.notEqual(authRuntimeProjectName(checkoutRoot), authRuntimeProjectName('/another/checkout'))
    assert.match(authRuntimeProjectName(checkoutRoot), /^lef-auth-runtime-[a-f0-9]{12}$/)
    assert.equal(authRuntimeComposeFile(checkoutRoot), metadata.composeFile)
})

test('accepts metadata only from this checkout without echoing the stored password', () => {
    assert.deepEqual(validateAuthRuntimeMetadata(metadata, checkoutRoot), metadata)
    for (const value of [
        { ...metadata, checkoutRoot: '/another/checkout' },
        { ...metadata, projectName: 'lef' },
        { ...metadata, composeFile: resolve(checkoutRoot, 'docker/compose.yaml') },
        { ...metadata, password: 'short' },
        undefined,
    ]) {
        assert.throws(
            () => validateAuthRuntimeMetadata(value, checkoutRoot),
            error => error.message.includes('does not belong') && !error.message.includes(metadata.password),
        )
    }
})

test('checks every Docker ownership label before reuse or removal', () => {
    const labels = {
        'com.docker.compose.project': metadata.projectName,
        'com.docker.compose.project.working_dir': checkoutRoot,
        'com.docker.compose.project.config_files': metadata.composeFile,
        'com.docker.compose.service': 'auth-mail',
    }
    assert.doesNotThrow(() => assertAuthRuntimeContainer(labels, checkoutRoot, 'auth-mail'))
    assert.throws(() => assertAuthRuntimeContainer(labels, checkoutRoot, 'auth-runtime-postgres'), /Refusing/)
    for (const key of Object.keys(labels)) {
        assert.throws(() => assertAuthRuntimeContainer({ ...labels, [key]: 'different' }, checkoutRoot, 'auth-mail'), /Refusing/)
    }
})

test('accepts only an IPv4 loopback port binding', () => {
    assert.equal(loopbackBinding('127.0.0.1:49152\n'), 49152)
    for (const binding of ['0.0.0.0:49152', '[::]:49152', '127.0.0.1:49152\n0.0.0.0:49152', '']) {
        assert.throws(() => loopbackBinding(binding), /Refusing/)
    }
})

test('requires every named runtime test to pass and none to be skipped', () => {
    assert.equal(passedAuthRuntimeTests(report()), REQUIRED_AUTH_RUNTIME_TESTS.length)
    assert.throws(() => passedAuthRuntimeTests(report({ tests: [], counts: { tests: 0, pass: 0 } })), /zero tests/)
    assert.throws(() => passedAuthRuntimeTests(report({ counts: { skipped: 1 } })), /skipped/)
    assert.throws(() => passedAuthRuntimeTests(report({ counts: { todo: 1 } })), /skipped/)
    assert.throws(() => passedAuthRuntimeTests(report({ counts: { fail: 1 } })), /failed/)
    assert.throws(() => passedAuthRuntimeTests(report({ tests: REQUIRED_AUTH_RUNTIME_TESTS.slice(1) })), /missing/)
    assert.throws(() => passedAuthRuntimeTests(report({ extra: 'not ok 99 - unexpected' })), /missing/)
    assert.throws(() => passedAuthRuntimeTests('no summary'), /zero tests/)
})
