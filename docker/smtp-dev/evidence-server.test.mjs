import assert from 'node:assert/strict'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createEvidenceFixture, EVIDENCE_CONTROL_LOCAL_PART, EVIDENCE_SCENARIOS } from './evidence-server.mjs'

const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tlsOptions = {
    cert: readFileSync(resolve(checkoutRoot, 'docker/smtp-dev/tls/smtp.crt')),
    key: readFileSync(resolve(checkoutRoot, 'docker/smtp-dev/tls/smtp.key')),
}
const hostname = 'evidence.lef.test'

function listen(server) {
    return new Promise((resolvePromise, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolvePromise(server.address().port))
    })
}

function close(server) {
    return new Promise(resolvePromise => server.close(resolvePromise))
}

function readResponse(socket) {
    return new Promise((resolvePromise, reject) => {
        let buffer = ''
        const onData = chunk => {
            buffer += chunk.toString('utf8')
            const lines = buffer.split('\r\n').filter(Boolean)
            const last = lines.at(-1)
            if (last !== undefined && /^\d{3} /.test(last)) {
                cleanup()
                resolvePromise(lines)
            }
        }
        const onClose = () => {
            cleanup()
            resolvePromise(null)
        }
        const onError = error => {
            cleanup()
            reject(error)
        }
        function cleanup() {
            socket.off('data', onData)
            socket.off('close', onClose)
            socket.off('error', onError)
        }
        socket.on('data', onData)
        socket.on('close', onClose)
        socket.on('error', onError)
    })
}

function writeCommand(socket, command) {
    socket.write(command + '\r\n')
}

async function connectAndNegotiateTls(port) {
    const plainSocket = netConnect(port, '127.0.0.1')
    await new Promise(resolvePromise => plainSocket.once('connect', resolvePromise))
    await readResponse(plainSocket)
    writeCommand(plainSocket, 'EHLO client.example.test')
    await readResponse(plainSocket)
    writeCommand(plainSocket, 'STARTTLS')
    await readResponse(plainSocket)

    const secureSocket = tlsConnect({ socket: plainSocket, rejectUnauthorized: false })
    await new Promise((resolvePromise, reject) => {
        secureSocket.once('secureConnect', resolvePromise)
        secureSocket.once('error', reject)
    })
    writeCommand(secureSocket, 'EHLO client.example.test')
    await readResponse(secureSocket)
    return secureSocket
}

async function runExchange(port, { mailFrom = 'contact@client.example.test', recipients }) {
    const socket = await connectAndNegotiateTls(port)
    writeCommand(socket, `MAIL FROM:<${mailFrom}>`)
    const mailFromResponse = await readResponse(socket)

    const rcptResponses = []
    if (mailFromResponse[0].startsWith('250')) {
        for (const recipient of recipients) {
            writeCommand(socket, `RCPT TO:<${recipient}>`)
            rcptResponses.push(await readResponse(socket))
        }
    }

    writeCommand(socket, 'QUIT')
    const quitResponse = await readResponse(socket).catch(() => null)

    if (!socket.destroyed) socket.destroy()
    return { mailFromResponse, rcptResponses, quitResponse }
}

async function withFixture(run) {
    const fixture = createEvidenceFixture({ hostname, tlsOptions })
    const smtpPort = await listen(fixture.smtpServer)
    const controlPort = await listen(fixture.controlServer)
    try {
        await run({ fixture, smtpPort, controlPort })
    } finally {
        await close(fixture.smtpServer)
        await close(fixture.controlServer)
    }
}

async function setScenario(controlPort, scenario) {
    const response = await fetch(`http://127.0.0.1:${controlPort}/scenario`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario }),
    })
    assert.equal(response.status, 204)
}

test('default scenario accepts both the control and the target, preserving original behavior', async () => {
    await withFixture(async ({ smtpPort }) => {
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[0][0], '250 OK')
        assert.equal(rcptResponses[1][0], '250 OK')
    })
})

test('NOOP always succeeds in plaintext, matching the fixture proxy connectivity probe', async () => {
    await withFixture(async ({ smtpPort }) => {
        const socket = netConnect(smtpPort, '127.0.0.1')
        await new Promise(resolvePromise => socket.once('connect', resolvePromise))
        await readResponse(socket)
        writeCommand(socket, 'NOOP')
        const response = await readResponse(socket)
        assert.equal(response[0], '250 OK')
        socket.destroy()
    })
})

test('target_accepted scenario rejects the control with 5.1.1 and accepts the target', async () => {
    await withFixture(async ({ fixture, smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_accepted')
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[0][0], '550 5.1.1 No such user')
        assert.equal(rcptResponses[1][0], '250 OK')
        assert.equal(fixture.getScenario(), 'target_accepted')
    })
})

test('target_missing scenario rejects both the control and the target with exact 5.1.1', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_missing')
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[0][0], '550 5.1.1 No such user')
        assert.equal(rcptResponses[1][0], '550 5.1.1 No such user')
    })
})

test('target_bare_reject scenario rejects the target with no enhanced status', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_bare_reject')
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[1][0], '550 Mailbox unavailable')
    })
})

test('target_ambiguous_reject scenario rejects the target with 554 5.7.1', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_ambiguous_reject')
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[1][0], '554 5.7.1 Message rejected due to policy')
    })
})

test('target_temporary_reject scenario rejects the target with a temporary 450', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_temporary_reject')
        const { rcptResponses } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[1][0], '450 4.2.1 Mailbox temporarily unavailable')
    })
})

test('a target_temporary_reject recipient stays greylisted after the scenario moves on to something else', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_temporary_reject')
        const first = await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.equal(first.rcptResponses[0][0], '450 4.2.1 Mailbox temporarily unavailable')

        // A real retry against the same recipient can land long after the scenario moves on (the app's own
        // greylist backoff is tens of seconds); it must still see a deferral, never the new scenario's answer.
        await setScenario(controlPort, 'default')
        const second = await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.equal(second.rcptResponses[0][0], '450 4.2.1 Mailbox temporarily unavailable')

        await setScenario(controlPort, 'target_accepted')
        const third = await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.equal(third.rcptResponses[0][0], '450 4.2.1 Mailbox temporarily unavailable')

        // A different recipient is unaffected by another address's greylist status.
        await setScenario(controlPort, 'default')
        const other = await runExchange(smtpPort, { recipients: [`someone-else@${hostname}`] })
        assert.equal(other.rcptResponses[0][0], '250 OK')
    })
})

test('reset restores the default scenario but does not clear a pending greylist', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_temporary_reject')
        const first = await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.equal(first.rcptResponses[0][0], '450 4.2.1 Mailbox temporarily unavailable')

        // Bruno calls /reset at the end of a run to restore the accepts-all baseline. The app's own retry
        // for this recipient is still scheduled tens of seconds out at that point; reset must not erase its
        // greylist status, or that later retry would see a clean slate and be wrongly, conclusively accepted.
        const response = await fetch(`http://127.0.0.1:${controlPort}/reset`, { method: 'POST' })
        assert.equal(response.status, 204)

        const second = await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.equal(second.rcptResponses[0][0], '450 4.2.1 Mailbox temporarily unavailable')

        // A different recipient is unaffected and sees the freshly-restored default scenario.
        const other = await runExchange(smtpPort, { recipients: [`someone-else@${hostname}`] })
        assert.equal(other.rcptResponses[0][0], '250 OK')
    })
})

test('sender_rejected scenario rejects MAIL FROM regardless of the recipient', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'sender_rejected')
        const { mailFromResponse, rcptResponses } = await runExchange(smtpPort, {
            recipients: [`person@${hostname}`],
        })
        assert.equal(mailFromResponse[0], '550 5.1.1 Sender address rejected')
        assert.equal(rcptResponses.length, 0)
    })
})

test('close_after_accept scenario accepts the target then closes the connection instead of answering QUIT', async () => {
    await withFixture(async ({ smtpPort, controlPort }) => {
        await setScenario(controlPort, 'close_after_accept')
        const { rcptResponses, quitResponse } = await runExchange(smtpPort, {
            recipients: [`${EVIDENCE_CONTROL_LOCAL_PART}@${hostname}`, `person@${hostname}`],
        })
        assert.equal(rcptResponses[1][0], '250 OK')
        assert.equal(quitResponse, null)
    })
})

test('the EHLO advertised before STARTTLS offers it, and the post-TLS EHLO is a single success line', async () => {
    await withFixture(async ({ smtpPort }) => {
        const plainSocket = netConnect(smtpPort, '127.0.0.1')
        await new Promise(resolvePromise => plainSocket.once('connect', resolvePromise))
        await readResponse(plainSocket)
        writeCommand(plainSocket, 'EHLO client.example.test')
        const firstEhlo = await readResponse(plainSocket)
        assert.ok(firstEhlo.some(line => line === '250-STARTTLS'))
        writeCommand(plainSocket, 'STARTTLS')
        await readResponse(plainSocket)
        const secureSocket = tlsConnect({ socket: plainSocket, rejectUnauthorized: false })
        await new Promise((resolvePromise, reject) => {
            secureSocket.once('secureConnect', resolvePromise)
            secureSocket.once('error', reject)
        })
        writeCommand(secureSocket, 'EHLO client.example.test')
        const secondEhlo = await readResponse(secureSocket)
        assert.deepEqual(secondEhlo, [`250 ${hostname}`])
        secureSocket.destroy()
    })
})

test('the control endpoint rejects an unknown scenario without changing the active one', async () => {
    await withFixture(async ({ fixture, controlPort }) => {
        const response = await fetch(`http://127.0.0.1:${controlPort}/scenario`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scenario: 'not_a_real_scenario' }),
        })
        assert.equal(response.status, 400)
        assert.equal(fixture.getScenario(), 'default')
    })
})

test('reset restores the default scenario and clears the connection counter', async () => {
    await withFixture(async ({ fixture, smtpPort, controlPort }) => {
        await setScenario(controlPort, 'target_missing')
        await runExchange(smtpPort, { recipients: [`person@${hostname}`] })
        assert.ok(fixture.getCounters().connections > 0)

        const response = await fetch(`http://127.0.0.1:${controlPort}/reset`, { method: 'POST' })
        assert.equal(response.status, 204)
        assert.equal(fixture.getScenario(), 'default')
        assert.equal(fixture.getCounters().connections, 0)
    })
})

test('every scenario in the closed enum is exercised by this suite', () => {
    assert.deepEqual(
        [...EVIDENCE_SCENARIOS].sort(),
        [
            'close_after_accept',
            'default',
            'sender_rejected',
            'target_accepted',
            'target_ambiguous_reject',
            'target_bare_reject',
            'target_missing',
            'target_temporary_reject',
        ].sort(),
    )
})
