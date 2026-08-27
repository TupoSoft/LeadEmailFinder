import { connect } from '@tuposoft/lead-email-finder/socket'
import { verifyListenerEgress } from './listener-health-check'

jest.mock('@tuposoft/lead-email-finder/socket', () => ({ connect: jest.fn() }))

const connectMock = connect as jest.Mock

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

const listener = {
    egressId: 'egress-a',
    bindIp: '172.29.10.2',
    port: 13001,
    egressIp: '203.0.113.21',
    auth: { user: 'egress-a', pass: 'secret' },
}
const probe = { host: '172.29.23.3', port: 2525, statusUrl: 'http://probe.internal/last-peer' }

describe('verifyListenerEgress', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
        connectMock.mockReset()
    })

    it('authenticates through exactly the given listener and CONNECTs to the probe target', async () => {
        connectMock.mockResolvedValueOnce({ destroy: jest.fn() })
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { peerAddress: '203.0.113.21' }))

        await expect(verifyListenerEgress(listener, probe)).resolves.toBe(true)

        expect(connectMock).toHaveBeenCalledWith({
            host: '172.29.23.3',
            port: 2525,
            timeout: 5_000,
            proxy: { id: 'egress-a', type: 'http', host: '172.29.10.2', port: 13001, user: 'egress-a', password: 'secret' },
        })
    })

    it('returns false when the observed peer does not match the declared egress IP', async () => {
        connectMock.mockResolvedValueOnce({ destroy: jest.fn() })
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { peerAddress: '198.51.100.9' }))

        await expect(verifyListenerEgress(listener, probe)).resolves.toBe(false)
    })

    it('returns false when the CONNECT tunnel fails', async () => {
        connectMock.mockRejectedValueOnce(new Error('407 Proxy Authentication Required'))

        await expect(verifyListenerEgress(listener, probe)).resolves.toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns false when the probe status endpoint is unreachable', async () => {
        connectMock.mockResolvedValueOnce({ destroy: jest.fn() })
        fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })

        await expect(verifyListenerEgress(listener, probe)).resolves.toBe(false)
    })

    it('closes the socket after a successful CONNECT', async () => {
        const destroy = jest.fn()
        connectMock.mockResolvedValueOnce({ destroy })
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { peerAddress: '203.0.113.21' }))

        await verifyListenerEgress(listener, probe)

        expect(destroy).toHaveBeenCalled()
    })
})
