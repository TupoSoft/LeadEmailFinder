import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyRecord } from '../domain/proxy-record'
import { ProxyRepository } from './ports/proxy-repository'
import { ProxyNotFoundError } from './proxy-not-found.error'
import { ProxyRegistryService } from './proxy-registry.service'

function record(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
    return {
        id: 'proxy-id',
        protocol: ProxyProtocol.SOCKS4,
        host: 'proxy.example.com',
        port: 1080,
        auth: { user: 'proxy-user', pass: 'proxy-password' },
        state: ProxyLifecycle.ACTIVE,
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('ProxyRegistryService', () => {
    let repository: jest.Mocked<ProxyRepository>
    let service: ProxyRegistryService

    beforeEach(() => {
        repository = {
            create: jest.fn(),
            findById: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            addBlacklist: jest.fn(),
            findActiveNotBlacklistedFor: jest.fn(),
            findAllActive: jest.fn(),
            findActiveExcluding: jest.fn(),
        }
        service = new ProxyRegistryService(repository)
    })

    it('returns active SOCKS4 registry proxies with internal credentials', async () => {
        repository.findAllActive.mockResolvedValue([
            record({ blacklists: ['mx.blocked.example'] }),
        ])

        await expect(service.get()).resolves.toEqual([
            {
                id: 'proxy-id',
                type: 'socks4',
                host: 'proxy.example.com',
                port: 1080,
                user: 'proxy-user',
                password: 'proxy-password',
                blacklists: ['mx.blocked.example'],
            },
        ])
        expect(repository.findAllActive).toHaveBeenCalled()
    })

    it('excludes blacklisted exchanges from active registry proxies', async () => {
        repository.findActiveExcluding.mockResolvedValue([])

        await expect(service.get(['mx.example.com'])).resolves.toEqual([])

        expect(repository.findActiveExcluding).toHaveBeenCalledWith(['mx.example.com'])
        expect(repository.findAllActive).not.toHaveBeenCalled()
    })

    it('adds a blacklist entry', async () => {
        repository.addBlacklist.mockResolvedValue(record({ blacklists: ['mx.example.com'] }))

        await expect(service.addToBlacklist('proxy-id', 'mx.example.com')).resolves.toEqual(
            expect.objectContaining({ blacklists: ['mx.example.com'] }),
        )
        expect(repository.addBlacklist).toHaveBeenCalledWith('proxy-id', 'mx.example.com')
    })

    it('throws ProxyNotFoundError when the requested proxy does not exist', async () => {
        repository.findById.mockResolvedValue(undefined)

        await expect(service.getById('missing')).rejects.toBeInstanceOf(ProxyNotFoundError)
    })

    it('throws ProxyNotFoundError when blacklisting a proxy that does not exist', async () => {
        repository.addBlacklist.mockResolvedValue(undefined)

        await expect(service.addToBlacklist('missing', 'mx.example.com')).rejects.toBeInstanceOf(ProxyNotFoundError)
    })
})
