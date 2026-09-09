#!/usr/bin/env node
// Deterministic STARTTLS evidence fixture for verification-billing/01. Never sends mail, never logs an
// address, envelope command, or raw SMTP reply; the fixture-only HTTP control endpoint selects a closed
// scenario enum and resets opaque counters. It is reached only on the Docker network (no host port).
import { createServer as createNetServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { TLSSocket } from 'node:tls'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `default` preserves the original accepts-all behavior (both the control and any target are accepted).
 * Every other scenario always rejects the control with an exact missing-recipient answer, so a Bruno
 * request only needs to select the target's own behavior.
 */
export const EVIDENCE_SCENARIOS = Object.freeze([
    'default',
    'target_accepted',
    'target_missing',
    'target_bare_reject',
    'target_ambiguous_reject',
    'target_temporary_reject',
    'sender_rejected',
    'close_after_accept',
])

export const EVIDENCE_CONTROL_LOCAL_PART = 'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak'

function isControlRecipient(recipient) {
    const [localPart] = recipient.split('@')
    return localPart === EVIDENCE_CONTROL_LOCAL_PART
}

function parseAddress(command, prefix) {
    const match = new RegExp(`^${prefix}:\\s*<([^>]*)>`, 'i').exec(command)
    return match?.[1] ?? ''
}

class LineReader {
    #buffer = ''
    #onLine

    constructor(onLine) {
        this.#onLine = onLine
    }

    push(chunk) {
        this.#buffer += chunk.toString('utf8')
        let index
        while ((index = this.#buffer.indexOf('\r\n')) !== -1) {
            const line = this.#buffer.slice(0, index)
            this.#buffer = this.#buffer.slice(index + 2)
            this.#onLine(line)
        }
    }
}

function writeLine(socket, line) {
    if (!socket.destroyed) socket.write(line + '\r\n')
}

/**
 * Creates the paired SMTP and fixture-control servers as one unit, neither listening yet. `hostname`
 * appears only in the greeting/EHLO banner; `tlsOptions` supplies the existing fixture certificate and key.
 */
export function createEvidenceFixture({ hostname, tlsOptions }) {
    let scenario = 'default'
    let counters = { connections: 0 }

    function ehloResponse(afterStartTls) {
        if (afterStartTls) return `250 ${hostname}`
        return [`250-${hostname}`, '250-STARTTLS', '250 SIZE 10485760']
    }

    function respondToRecipient(socket, recipient, sawSender) {
        if (!sawSender) {
            writeLine(socket, '503 Bad sequence of commands')
            return
        }

        if (scenario === 'default') {
            writeLine(socket, '250 OK')
            return
        }

        if (isControlRecipient(recipient)) {
            writeLine(socket, '550 5.1.1 No such user')
            return
        }

        switch (scenario) {
            case 'target_accepted':
            case 'close_after_accept':
                writeLine(socket, '250 OK')
                return
            case 'target_missing':
                writeLine(socket, '550 5.1.1 No such user')
                return
            case 'target_bare_reject':
                writeLine(socket, '550 Mailbox unavailable')
                return
            case 'target_ambiguous_reject':
                writeLine(socket, '554 5.7.1 Message rejected due to policy')
                return
            case 'target_temporary_reject':
                writeLine(socket, '450 4.2.1 Mailbox temporarily unavailable')
                return
            default:
                writeLine(socket, '250 OK')
        }
    }

    function handleSession(initialSocket) {
        counters.connections += 1
        let socket = initialSocket
        let secure = false
        let sawSender = false
        let reader

        function onLine(line) {
            const command = line.trim()
            const upper = command.toUpperCase()

            if (upper.startsWith('EHLO')) {
                const response = ehloResponse(secure)
                if (Array.isArray(response)) response.forEach(part => writeLine(socket, part))
                else writeLine(socket, response)
                return
            }

            if (upper === 'STARTTLS' && !secure) {
                writeLine(socket, '220 Ready to start TLS')
                const plainSocket = socket
                plainSocket.removeAllListeners('data')
                const secureSocket = new TLSSocket(plainSocket, {
                    isServer: true,
                    cert: tlsOptions.cert,
                    key: tlsOptions.key,
                })
                secureSocket.on('data', chunk => reader.push(chunk))
                secureSocket.on('error', () => {
                    /* fixture-only: a handshake or transport error just ends this session */
                })
                socket = secureSocket
                secure = true
                return
            }

            if (upper === 'NOOP') {
                writeLine(socket, '250 OK')
                return
            }

            if (upper.startsWith('MAIL FROM')) {
                if (scenario === 'sender_rejected') {
                    writeLine(socket, '550 5.1.1 Sender address rejected')
                    return
                }
                sawSender = true
                writeLine(socket, '250 OK')
                return
            }

            if (upper.startsWith('RCPT TO')) {
                const recipient = parseAddress(command, 'RCPT TO')
                respondToRecipient(socket, recipient, sawSender)
                return
            }

            if (upper === 'QUIT') {
                if (scenario === 'close_after_accept') {
                    socket.destroy()
                    return
                }
                writeLine(socket, '221 Bye')
                socket.end()
                return
            }

            if (upper === 'DATA') {
                writeLine(socket, '503 Bad sequence of commands')
                return
            }

            writeLine(socket, '500 Command not recognized')
        }

        reader = new LineReader(onLine)
        writeLine(socket, `220 ${hostname} ESMTP`)
        socket.on('data', chunk => reader.push(chunk))
        socket.on('error', () => {
            /* fixture-only: never surface transport errors */
        })
    }

    const smtpServer = createNetServer(handleSession)

    const controlServer = createHttpServer((request, response) => {
        if (request.method === 'POST' && request.url === '/reset') {
            scenario = 'default'
            counters = { connections: 0 }
            response.writeHead(204).end()
            return
        }

        if (request.method === 'PUT' && request.url === '/scenario') {
            let body = ''
            request.on('data', chunk => (body += chunk))
            request.on('end', () => {
                let parsed
                try {
                    parsed = JSON.parse(body)
                } catch {
                    response.writeHead(400).end()
                    return
                }
                if (typeof parsed?.scenario !== 'string' || !EVIDENCE_SCENARIOS.includes(parsed.scenario)) {
                    response.writeHead(400).end()
                    return
                }
                scenario = parsed.scenario
                response.writeHead(204).end()
            })
            return
        }

        if (request.method === 'GET' && request.url === '/counters') {
            response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(counters))
            return
        }

        response.writeHead(404).end()
    })

    return { smtpServer, controlServer, getScenario: () => scenario, getCounters: () => counters }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const fixture = createEvidenceFixture({
        hostname: process.env.EVIDENCE_HOSTNAME ?? 'evidence.lef.test',
        tlsOptions: {
            cert: readFileSync(process.env.EVIDENCE_TLS_CERT_FILE ?? '/smtp-dev-tls/smtp.crt'),
            key: readFileSync(process.env.EVIDENCE_TLS_KEY_FILE ?? '/smtp-dev-tls/smtp.key'),
        },
    })
    fixture.smtpServer.listen(Number(process.env.EVIDENCE_SMTP_PORT ?? 2525))
    fixture.controlServer.listen(Number(process.env.EVIDENCE_CONTROL_PORT ?? 8025))
}
