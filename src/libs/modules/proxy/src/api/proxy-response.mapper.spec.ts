import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyRecord } from '../domain/proxy-record'
import { toProxyDto, toProxyListDto } from './proxy-response.mapper'

function record(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
    return {
        id: 'proxy-id',
        protocol: ProxyProtocol.SOCKS5,
        host: 'proxy.example.com',
        port: 1080,
        auth: { user: 'proxy-user', pass: 'proxy-password' },
        state: ProxyLifecycle.ACTIVE,
        weight: 2,
        maxConcurrent: 3,
        requestsPerMinute: 20,
        description: 'a proxy',
        blacklists: ['mx.example.com'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        ...overrides,
    }
}

describe('toProxyDto', () => {
    it('maps every field except auth credentials', () => {
        const dto = toProxyDto(record())

        expect(dto).toMatchObject({
            id: 'proxy-id',
            protocol: ProxyProtocol.SOCKS5,
            host: 'proxy.example.com',
            port: 1080,
            state: ProxyLifecycle.ACTIVE,
            weight: 2,
            maxConcurrent: 3,
            requestsPerMinute: 20,
            description: 'a proxy',
        })
        expect(dto.auth).toBeUndefined()
        expect(dto).not.toHaveProperty('blacklists')
    })
})

describe('toProxyListDto', () => {
    it('maps every proxy and carries the next page token through', () => {
        const dto = toProxyListDto([record(), record({ id: 'second-id' })], 'second-id')

        expect(dto.proxies.map(proxy => proxy.id)).toEqual(['proxy-id', 'second-id'])
        expect(dto.nextPageToken).toBe('second-id')
    })
})
