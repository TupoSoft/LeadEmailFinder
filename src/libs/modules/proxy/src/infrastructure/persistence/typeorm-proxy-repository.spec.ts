import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProxyLifecycle } from '../../domain/proxy-lifecycle'
import { ProxyProtocol } from '../../domain/proxy-protocol'
import { Proxy } from './proxy.entity'
import { TypeOrmProxyRepository } from './typeorm-proxy-repository'

describe('TypeOrmProxyRepository', () => {
    let repository: TypeOrmProxyRepository
    let proxyRepo: {
        create: jest.Mock
        findOneBy: jest.Mock
        find: jest.Mock
        findBy: jest.Mock
        save: jest.Mock
        remove: jest.Mock
        createQueryBuilder: jest.Mock
    }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                TypeOrmProxyRepository,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        create: jest.fn(),
                        findOneBy: jest.fn(),
                        find: jest.fn(),
                        findBy: jest.fn(),
                        save: jest.fn(),
                        remove: jest.fn(),
                        createQueryBuilder: jest.fn(),
                    },
                },
            ],
        }).compile()

        repository = moduleRef.get(TypeOrmProxyRepository)
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy))
    })

    function entity(overrides: Partial<Proxy> = {}): Proxy {
        return {
            id: '6d7983d6-3eba-4eb7-bd8f-ebef258faeca',
            protocol: ProxyProtocol.HTTP,
            host: 'proxy.example.com',
            port: 8080,
            state: ProxyLifecycle.ACTIVE,
            weight: 1,
            maxConcurrent: 1,
            requestsPerMinute: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        }
    }

    describe('create', () => {
        it('creates and saves a new proxy', async () => {
            const fields = {
                protocol: ProxyProtocol.HTTP,
                host: 'proxy.example.com',
                port: 8080,
                state: ProxyLifecycle.DISABLED,
                weight: 1,
                maxConcurrent: 1,
                requestsPerMinute: 10,
            }
            proxyRepo.create.mockReturnValue(entity())
            proxyRepo.save.mockResolvedValue(entity())

            await repository.create(fields)

            expect(proxyRepo.create).toHaveBeenCalledWith(fields)
        })
    })

    describe('findById', () => {
        it('returns the mapped proxy', async () => {
            const proxy = entity()
            proxyRepo.findOneBy.mockResolvedValue(proxy)

            await expect(repository.findById(proxy.id)).resolves.toEqual(expect.objectContaining({ id: proxy.id }))
            expect(proxyRepo.findOneBy).toHaveBeenCalledWith({ id: proxy.id })
        })

        it('returns undefined without querying when the id is not UUID-shaped', async () => {
            await expect(repository.findById('not-a-uuid')).resolves.toBeUndefined()
            expect(proxyRepo.findOneBy).not.toHaveBeenCalled()
        })

        it('returns undefined when no proxy matches', async () => {
            proxyRepo.findOneBy.mockResolvedValue(null)

            await expect(repository.findById('6d7983d6-3eba-4eb7-bd8f-ebef258faeca')).resolves.toBeUndefined()
        })
    })

    describe('list', () => {
        it('queries ordered by id ascending with the given take', async () => {
            proxyRepo.find.mockResolvedValue([entity()])

            await repository.list(3, undefined)

            expect(proxyRepo.find).toHaveBeenCalledWith({ where: {}, order: { id: 'ASC' }, take: 3 })
        })

        it('filters by MoreThan(afterId) when a cursor is given', async () => {
            proxyRepo.find.mockResolvedValue([])

            await repository.list(3, '1d7983d6-3eba-4eb7-bd8f-ebef258faeca')

            expect(proxyRepo.find).toHaveBeenCalledWith({
                where: { id: expect.objectContaining({ value: '1d7983d6-3eba-4eb7-bd8f-ebef258faeca' }) },
                order: { id: 'ASC' },
                take: 3,
            })
        })
    })

    describe('update', () => {
        it('merges the fields onto the existing entity and saves it', async () => {
            const existing = entity({ host: 'old-host' })
            proxyRepo.findOneBy.mockResolvedValue(existing)
            proxyRepo.save.mockResolvedValue({ ...existing, host: 'new-host' })

            await repository.update(existing.id, { host: 'new-host' })

            expect(proxyRepo.save).toHaveBeenCalledWith({ ...existing, host: 'new-host' })
        })

        it('returns undefined without querying when the id is not UUID-shaped', async () => {
            await expect(repository.update('not-a-uuid', { host: 'new-host' })).resolves.toBeUndefined()
            expect(proxyRepo.findOneBy).not.toHaveBeenCalled()
        })

        it('returns undefined when no proxy matches', async () => {
            proxyRepo.findOneBy.mockResolvedValue(null)

            await expect(
                repository.update('6d7983d6-3eba-4eb7-bd8f-ebef258faeca', { host: 'new-host' }),
            ).resolves.toBeUndefined()
        })
    })

    describe('delete', () => {
        it('removes and returns the proxy captured before removal', async () => {
            const existing = entity()
            proxyRepo.findOneBy.mockResolvedValue(existing)
            proxyRepo.remove.mockImplementation((proxy: Proxy) => {
                Reflect.deleteProperty(proxy, 'id')
                return Promise.resolve(proxy)
            })

            await expect(repository.delete(existing.id)).resolves.toEqual(expect.objectContaining({ id: existing.id }))
            expect(proxyRepo.remove).toHaveBeenCalledWith(existing)
        })

        it('returns undefined without querying when the id is not UUID-shaped', async () => {
            await expect(repository.delete('not-a-uuid')).resolves.toBeUndefined()
            expect(proxyRepo.findOneBy).not.toHaveBeenCalled()
        })
    })

    describe('addBlacklist', () => {
        it('adds the MX host once', async () => {
            const existing = entity({ blacklists: ['mx.example.com'] })
            proxyRepo.findOneBy.mockResolvedValue(existing)
            proxyRepo.save.mockResolvedValue(existing)

            await expect(repository.addBlacklist(existing.id, 'mx.example.com')).resolves.toEqual(
                expect.objectContaining({ blacklists: ['mx.example.com'] }),
            )
            expect(proxyRepo.save).toHaveBeenCalledWith(existing)
        })

        it('returns undefined without querying when the id is not UUID-shaped', async () => {
            await expect(repository.addBlacklist('not-a-uuid', 'mx.example.com')).resolves.toBeUndefined()
            expect(proxyRepo.findOneBy).not.toHaveBeenCalled()
        })
    })

    describe('findActiveNotBlacklistedFor', () => {
        it('selects an active proxy that is not blacklisted for the MX host', async () => {
            const proxy = entity()
            const getMany = jest.fn().mockResolvedValue([proxy])
            const andWhere = jest.fn().mockReturnValue({ getMany })
            const where = jest.fn().mockReturnValue({ andWhere })
            proxyRepo.createQueryBuilder.mockReturnValue({ where })

            await expect(repository.findActiveNotBlacklistedFor('mx.example.com')).resolves.toEqual([
                expect.objectContaining({ id: proxy.id }),
            ])
            expect(where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            expect(andWhere).toHaveBeenCalledWith(
                '(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))',
                { mxHost: 'mx.example.com' },
            )
        })
    })

    describe('findAllActive', () => {
        it('queries by active state', async () => {
            proxyRepo.findBy.mockResolvedValue([entity()])

            await repository.findAllActive()

            expect(proxyRepo.findBy).toHaveBeenCalledWith({ state: ProxyLifecycle.ACTIVE })
        })
    })

    describe('findActiveExcluding', () => {
        it('excludes proxies blacklisted for any given exchange', async () => {
            const getMany = jest.fn().mockResolvedValue([])
            const andWhere = jest.fn().mockReturnValue({ getMany })
            const where = jest.fn().mockReturnValue({ andWhere })
            proxyRepo.createQueryBuilder.mockReturnValue({ where })

            await expect(repository.findActiveExcluding(['mx.example.com'])).resolves.toEqual([])

            expect(proxyRepo.createQueryBuilder).toHaveBeenCalledWith('proxy')
            expect(where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            expect(andWhere).toHaveBeenCalledWith(
                'proxy.blacklists IS NULL OR NOT (proxy.blacklists && ARRAY[:...exchanges])',
                { exchanges: ['mx.example.com'] },
            )
        })
    })
})
