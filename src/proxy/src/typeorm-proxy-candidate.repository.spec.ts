import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProxyLifecycle, ProxyProtocol } from './proxy.dto'
import { Proxy } from './proxy.entity'
import { TypeOrmProxyCandidateRepository } from './typeorm-proxy-candidate.repository'

describe('TypeOrmProxyCandidateRepository', () => {
    let repository: TypeOrmProxyCandidateRepository
    let proxyRepo: { createQueryBuilder: jest.Mock; findOneBy: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                TypeOrmProxyCandidateRepository,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        createQueryBuilder: jest.fn(),
                        findOneBy: jest.fn(),
                    },
                },
            ],
        }).compile()

        repository = moduleRef.get(TypeOrmProxyCandidateRepository)
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy))
    })

    it('returns mapped active candidates that are not blacklisted or excluded', async () => {
        const entity = createProxy()
        const getMany = jest.fn().mockResolvedValue([entity])
        const andWhere = jest.fn()
        const query = { where: jest.fn(), andWhere, getMany }
        query.where.mockReturnValue(query)
        andWhere.mockReturnValue(query)
        proxyRepo.createQueryBuilder.mockReturnValue(query)

        await expect(repository.findEligible('mx.example.com', ['excluded-proxy'])).resolves.toEqual([
            {
                proxy: {
                    id: entity.id,
                    type: 'socks5',
                    host: entity.host,
                    port: entity.port,
                    user: 'user',
                    password: 'password',
                    blacklists: [],
                },
                weight: 2,
                maxConcurrent: 3,
                requestsPerMinute: 20,
            },
        ])
        expect(query.where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
        expect(andWhere).toHaveBeenNthCalledWith(
            1,
            '(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))',
            { mxHost: 'mx.example.com' },
        )
        expect(andWhere).toHaveBeenNthCalledWith(2, 'proxy.id NOT IN (:...excludedProxyIds)', {
            excludedProxyIds: ['excluded-proxy'],
        })
    })

    it('returns only an explicitly requested active proxy that is not blacklisted for the MX host', async () => {
        const entity = createProxy()
        proxyRepo.findOneBy.mockResolvedValue(entity)

        await expect(repository.findActiveById('mx.example.com', entity.id)).resolves.toEqual(
            expect.objectContaining({ proxy: expect.objectContaining({ id: entity.id }) }),
        )
        expect(proxyRepo.findOneBy).toHaveBeenCalledWith({ id: entity.id, state: ProxyLifecycle.ACTIVE })

        proxyRepo.findOneBy.mockResolvedValue({ ...entity, blacklists: ['mx.example.com'] })
        await expect(repository.findActiveById('mx.example.com', entity.id)).resolves.toBeUndefined()
    })
})

function createProxy(): Proxy {
    return {
        id: 'proxy-id',
        protocol: ProxyProtocol.SOCKS5,
        host: 'proxy.example.com',
        port: 1080,
        auth: { user: 'user', pass: 'password' },
        state: ProxyLifecycle.ACTIVE,
        weight: 2,
        maxConcurrent: 3,
        requestsPerMinute: 20,
        blacklists: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}
