import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from 'node:net'

/**
 * The disposable SMTP peer fixture plan 13's health check targets. Records the remote address of the
 * most recently accepted TCP connection and reports it over a small HTTP status endpoint, so
 * `verifyListenerEgress` can assert a listener's CONNECT tunnel actually originated from its declared
 * egress IP. Speaks just enough of a banner to be a plausible SMTP peer; it never needs a full SMTP
 * handshake because the health check only proves the tunnel and its source address.
 */

export function normalizePeerAddress(remoteAddress: string | undefined): string | undefined {
    if (remoteAddress === undefined) {
        return undefined
    }

    const ipv4MappedPrefix = '::ffff:'
    return remoteAddress.startsWith(ipv4MappedPrefix) ? remoteAddress.slice(ipv4MappedPrefix.length) : remoteAddress
}

export interface PeerStatus {
    readonly peerAddress: string | null
    readonly observedAt: string | null
}

export class PeerTracker {
    private lastPeerAddress?: string
    private lastObservedAt?: string

    record(remoteAddress: string | undefined, observedAt: Date = new Date()): void {
        const normalized = normalizePeerAddress(remoteAddress)

        if (normalized === undefined) {
            return
        }

        this.lastPeerAddress = normalized
        this.lastObservedAt = observedAt.toISOString()
    }

    toStatus(): PeerStatus {
        return { peerAddress: this.lastPeerAddress ?? null, observedAt: this.lastObservedAt ?? null }
    }
}

export interface SmtpPeerProbeOptions {
    readonly smtpHost: string
    readonly smtpPort: number
    readonly statusHost: string
    readonly statusPort: number
}

export interface SmtpPeerProbeHandle {
    readonly tracker: PeerTracker
    readonly smtpPort: number
    readonly statusPort: number
    close(): Promise<void>
}

export function startSmtpPeerProbe(options: SmtpPeerProbeOptions): Promise<SmtpPeerProbeHandle> {
    const tracker = new PeerTracker()

    const tcpServer: TcpServer = createTcpServer((socket: Socket) => {
        tracker.record(socket.remoteAddress)
        socket.end('220 proxy-fleet smtp-peer-probe\r\n')
    })

    const httpServer: HttpServer = createHttpServer((req, res) => {
        if (req.url === '/last-peer') {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify(tracker.toStatus()))
            return
        }

        res.writeHead(404)
        res.end()
    })

    return new Promise((resolve, reject) => {
        tcpServer.once('error', reject)
        httpServer.once('error', reject)

        tcpServer.listen(options.smtpPort, options.smtpHost, () => {
            httpServer.listen(options.statusPort, options.statusHost, () => {
                const smtpAddress = tcpServer.address()
                const statusAddress = httpServer.address()

                resolve({
                    tracker,
                    smtpPort: typeof smtpAddress === 'object' && smtpAddress !== null ? smtpAddress.port : options.smtpPort,
                    statusPort:
                        typeof statusAddress === 'object' && statusAddress !== null ? statusAddress.port : options.statusPort,
                    close: () =>
                        new Promise((resolveClose, rejectClose) => {
                            let pending = 2
                            const done = (error?: Error): void => {
                                if (error) {
                                    rejectClose(error)
                                    return
                                }
                                pending -= 1
                                if (pending === 0) {
                                    resolveClose()
                                }
                            }
                            tcpServer.close(err => done(err ?? undefined))
                            httpServer.close(err => done(err ?? undefined))
                        }),
                })
            })
        })
    })
}
