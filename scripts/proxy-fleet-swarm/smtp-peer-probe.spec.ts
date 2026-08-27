import { connect as netConnect } from 'node:net'
import { normalizePeerAddress, PeerTracker, startSmtpPeerProbe, type SmtpPeerProbeHandle } from './smtp-peer-probe'

describe('normalizePeerAddress', () => {
    it('strips the IPv4-mapped IPv6 prefix', () => {
        expect(normalizePeerAddress('::ffff:203.0.113.21')).toBe('203.0.113.21')
    })

    it('leaves a plain IPv4 address unchanged', () => {
        expect(normalizePeerAddress('203.0.113.21')).toBe('203.0.113.21')
    })

    it('passes an undefined address through', () => {
        expect(normalizePeerAddress(undefined)).toBeUndefined()
    })
})

describe('PeerTracker', () => {
    it('reports no peer before any connection is recorded', () => {
        expect(new PeerTracker().toStatus()).toEqual({ peerAddress: null, observedAt: null })
    })

    it('records and normalizes the most recent peer address', () => {
        const tracker = new PeerTracker()
        const observedAt = new Date('2026-08-28T00:00:00.000Z')

        tracker.record('::ffff:203.0.113.21', observedAt)

        expect(tracker.toStatus()).toEqual({ peerAddress: '203.0.113.21', observedAt: observedAt.toISOString() })
    })

    it('overwrites with each subsequent connection', () => {
        const tracker = new PeerTracker()

        tracker.record('203.0.113.21', new Date('2026-08-28T00:00:00.000Z'))
        tracker.record('203.0.113.22', new Date('2026-08-28T00:00:01.000Z'))

        expect(tracker.toStatus().peerAddress).toBe('203.0.113.22')
    })

    it('ignores an undefined remote address', () => {
        const tracker = new PeerTracker()
        tracker.record('203.0.113.21')
        tracker.record(undefined)

        expect(tracker.toStatus().peerAddress).toBe('203.0.113.21')
    })
})

describe('startSmtpPeerProbe (end to end, loopback only)', () => {
    let handle: SmtpPeerProbeHandle | undefined

    afterEach(async () => {
        await handle?.close()
        handle = undefined
    })

    it('reports the observed peer address of a TCP connection over the status endpoint', async () => {
        handle = await startSmtpPeerProbe({ smtpHost: '127.0.0.1', smtpPort: 0, statusHost: '127.0.0.1', statusPort: 0 })

        await new Promise<void>((resolve, reject) => {
            const socket = netConnect(handle!.smtpPort, '127.0.0.1')
            socket.resume() // Drain the server's banner so the socket can reach 'close' without a reader deadlock.
            socket.once('connect', () => socket.end())
            socket.once('close', () => resolve())
            socket.once('error', reject)
        })

        const statusResponse = await fetch(`http://127.0.0.1:${handle.statusPort}/last-peer`)
        const status = (await statusResponse.json()) as { peerAddress: string | null; observedAt: string | null }

        expect(status.peerAddress).toBe('127.0.0.1')
        expect(status.observedAt).not.toBeNull()
    })

    it('returns 404 for any other path', async () => {
        handle = await startSmtpPeerProbe({ smtpHost: '127.0.0.1', smtpPort: 0, statusHost: '127.0.0.1', statusPort: 0 })

        const response = await fetch(`http://127.0.0.1:${handle.statusPort}/unknown`)

        expect(response.status).toBe(404)
    })
})
