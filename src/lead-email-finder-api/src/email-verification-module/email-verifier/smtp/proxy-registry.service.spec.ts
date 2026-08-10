import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Proxy } from '../../../../../proxy/src/proxy.entity'
import { ProxyLifecycle, ProxyProtocol } from '../../../../../proxy/src/proxy.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'
import { ProxyRegistryService } from './proxy-registry.service'

describe('ProxyRegistryService', () => {
    let service: ProxyRegistryService
    let proxyRepo: {
        findBy: jest.Mock
        findOneBy: jest.Mock
        save: jest.Mock
        createQueryBuilder: jest.Mock
    }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProxyRegistryService,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        findBy: jest.fn(),
                        findOneBy: jest.fn(),
                        save: jest.fn(),
                        createQueryBuilder: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = moduleRef.get(ProxyRegistryService)
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy))
    })

    it('returns active SOCKS4 registry proxies with internal credentials', async () => {
        proxyRepo.findBy.mockResolvedValue([
            {
                id: 'proxy-id',
                protocol: ProxyProtocol.SOCKS4,
                host: 'proxy.example.com',
                port: 1080,
                auth: { user: 'proxy-user', pass: 'proxy-password' },
                blacklists: ['mx.blocked.example'],
            },
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
        expect(proxyRepo.findBy).toHaveBeenCalledWith({ state: ProxyLifecycle.ACTIVE })
    })

    it('excludes blacklisted exchanges from active registry proxies', async () => {
        const getMany = jest.fn().mockResolvedValue([])
        const andWhere = jest.fn().mockReturnValue({ getMany })
        const where = jest.fn().mockReturnValue({ andWhere })
        proxyRepo.createQueryBuilder.mockReturnValue({ where })

        await expect(service.get(['mx.example.com'])).resolves.toEqual([])

        expect(proxyRepo.createQueryBuilder).toHaveBeenCalledWith('proxy')
        expect(where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
        expect(andWhere).toHaveBeenCalledWith(
            'proxy.blacklists IS NULL OR NOT (proxy.blacklists && ARRAY[:...exchanges])',
            { exchanges: ['mx.example.com'] },
        )
    })

    it('adds a blacklist entry once', async () => {
        const proxy = {
            id: 'proxy-id',
            protocol: ProxyProtocol.HTTP,
            host: 'proxy.example.com',
            port: 8080,
            blacklists: ['mx.example.com'],
        } as Proxy
        proxyRepo.findOneBy.mockResolvedValue(proxy)
        proxyRepo.save.mockResolvedValue(proxy)

        await expect(service.addToBlacklist('proxy-id', 'mx.example.com')).resolves.toEqual(
            expect.objectContaining({ blacklists: ['mx.example.com'] }),
        )
        expect(proxyRepo.save).toHaveBeenCalledWith(proxy)
    })

    it('throws when the requested proxy does not exist', async () => {
        proxyRepo.findOneBy.mockResolvedValue(null)

        await expect(service.getById('missing')).rejects.toThrow(ProxyNotFoundException)
    })
})
