import { Test } from '@nestjs/testing'
import { ProxyService } from './proxy.service'
import { Proxy } from './proxy.entity'
import { CreateProxyDto, ProxyLifecycle, ProxyProtocol } from './proxy.dto'
import { getMapperToken } from '@automapper/nestjs'
import { BadRequestException } from '@nestjs/common'
import { ProxyNotFoundException } from './proxy-not-found.exception'
import { getRepositoryToken } from '@nestjs/typeorm'

describe('ProxyService', () => {
    let service: ProxyService
    let proxyRepo: {
        create: jest.Mock
        findOneBy: jest.Mock
        find: jest.Mock
        save: jest.Mock
        remove: jest.Mock
        createQueryBuilder: jest.Mock
    }
    let mapper: {
        map: jest.Mock
        mapArray: jest.Mock
    }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProxyService,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        create: jest.fn(),
                        findOneBy: jest.fn(),
                        find: jest.fn(),
                        save: jest.fn(),
                        remove: jest.fn(),
                        createQueryBuilder: jest.fn(),
                    },
                },
                {
                    provide: getMapperToken(),
                    useValue: {
                        map: jest.fn(),
                        mapArray: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = moduleRef.get(ProxyService)
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy))
        mapper = moduleRef.get(getMapperToken())
    })

    describe('createProxy', () => {
        it('applies the default lifecycle and capacity values', async () => {
            const dto = {
                protocol: ProxyProtocol.HTTP,
                host: 'proxy.example.com',
                port: 8080,
            } as CreateProxyDto
            const createdProxy = {
                ...dto,
                state: ProxyLifecycle.ACTIVE,
                weight: 1,
                maxConcurrent: 1,
                requestsPerMinute: 10,
            } as Proxy

            proxyRepo.create.mockReturnValue(createdProxy)
            proxyRepo.save.mockResolvedValue(createdProxy)
            mapper.map.mockReturnValue(createdProxy)

            await service.createProxy(dto)

            expect(proxyRepo.create).toHaveBeenCalledWith({
                ...dto,
                state: ProxyLifecycle.ACTIVE,
                weight: 1,
                maxConcurrent: 1,
                requestsPerMinute: 10,
            })
        })
    })

    describe('getProxy', () => {
        it('returns the mapped proxy', async () => {
            const id = '6d7983d6-3eba-4eb7-bd8f-ebef258faeca'
            const proxy = { id } as Proxy
            const descriptor = { id }
            proxyRepo.findOneBy.mockResolvedValue(proxy)
            mapper.map.mockReturnValue(descriptor)

            await expect(service.getProxy(id)).resolves.toEqual(descriptor)
            expect(proxyRepo.findOneBy).toHaveBeenCalledWith({ id })
            expect(mapper.map).toHaveBeenCalledWith(proxy, Proxy, expect.any(Function))
        })

        it('throws when the proxy does not exist', async () => {
            const id = '6d7983d6-3eba-4eb7-bd8f-ebef258faeca'
            proxyRepo.findOneBy.mockResolvedValue(null)

            await expect(service.getProxy(id)).rejects.toBeInstanceOf(ProxyNotFoundException)
        })
    })

    describe('listProxies', () => {
        it('returns a page and a cursor for the next page', async () => {
            const first = { id: '1d7983d6-3eba-4eb7-bd8f-ebef258faeca' } as Proxy
            const second = { id: '2d7983d6-3eba-4eb7-bd8f-ebef258faeca' } as Proxy
            const third = { id: '3d7983d6-3eba-4eb7-bd8f-ebef258faeca' } as Proxy
            proxyRepo.find.mockResolvedValue([first, second, third])
            mapper.mapArray.mockReturnValue([{ id: first.id }, { id: second.id }])

            await expect(service.listProxies({ pageSize: 2 })).resolves.toEqual({
                proxies: [{ id: first.id }, { id: second.id }],
                nextPageToken: second.id,
            })
            expect(proxyRepo.find).toHaveBeenCalledWith({ where: {}, order: { id: 'ASC' }, take: 3 })
        })

        it('rejects an invalid page token', async () => {
            await expect(service.listProxies({ pageSize: 10, pageToken: 'not-an-object-id' })).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })
    })

    describe('updateProxy', () => {
        it('updates only fields in the update mask', async () => {
            const id = '6d7983d6-3eba-4eb7-bd8f-ebef258faeca'
            const entity = { id, host: 'old-host', protocol: 1 } as Proxy
            const descriptor = { id, host: 'new-host' }
            proxyRepo.findOneBy.mockResolvedValue(entity)
            proxyRepo.save.mockResolvedValue({ ...entity, host: 'new-host' })
            mapper.map.mockReturnValue(descriptor)

            await expect(
                service.updateProxy(id, { host: 'new-host' }),
            ).resolves.toEqual(descriptor)

            expect(proxyRepo.save).toHaveBeenCalledWith({ ...entity, host: 'new-host' })
        })
    })

    describe('deleteProxy', () => {
        it('removes and returns the proxy', async () => {
            const id = '6d7983d6-3eba-4eb7-bd8f-ebef258faeca'
            const entity = { id } as Proxy
            proxyRepo.findOneBy.mockResolvedValue(entity)
            mapper.map.mockImplementation((proxy: Proxy) => ({ id: proxy.id }))
            proxyRepo.remove.mockImplementation((proxy: Proxy) => {
                Reflect.deleteProperty(proxy, 'id')
                return Promise.resolve(proxy)
            })

            await expect(service.deleteProxy(id)).resolves.toEqual({ id })
            expect(proxyRepo.remove).toHaveBeenCalledWith(entity)
        })
    })

    describe('getHealthyProxy', () => {
        it('selects an active proxy that is not blacklisted for the MX host', async () => {
            const proxy = { id: '6d7983d6-3eba-4eb7-bd8f-ebef258faeca', weight: 1 } as Proxy
            const getMany = jest.fn().mockResolvedValue([proxy])
            const andWhere = jest.fn().mockReturnValue({ getMany })
            const where = jest.fn().mockReturnValue({ andWhere })
            proxyRepo.createQueryBuilder.mockReturnValue({ where })
            mapper.map.mockReturnValue({ id: proxy.id })

            await expect(service.getHealthyProxy('mx.example.com')).resolves.toEqual({ id: proxy.id })
            expect(where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            expect(andWhere).toHaveBeenCalledWith(
                '(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))',
                { mxHost: 'mx.example.com' },
            )
        })
    })

    describe('reportProxyBlacklist', () => {
        it('adds the MX host once', async () => {
            const id = '6d7983d6-3eba-4eb7-bd8f-ebef258faeca'
            const entity = { id, blacklists: ['mx.example.com'] } as Proxy
            proxyRepo.findOneBy.mockResolvedValue(entity)

            await expect(service.reportProxyBlacklist(id, { mxHost: 'mx.example.com' })).resolves.toBeUndefined()
            expect(proxyRepo.save).toHaveBeenCalledWith(entity)
        })
    })
})
