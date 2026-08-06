import { Test, TestingModule } from '@nestjs/testing'
import { ProxyService } from './proxy.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { Proxy } from './proxy.entity'
import { getMapperToken } from '@automapper/nestjs'
import { ProxyResponse } from './proxy-response.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'
import { ProxyType } from './proxy-type.enum'

describe('ProxyService', () => {
    let service: ProxyService
    let repo: jest.Mocked<Repository<Proxy>>
    // Mapper.map/mapArray are generic overloaded methods; jest.Mocked<Mapper> collapses
    // their generics to `Dictionary<any>`, so mockReturnValue rejects concrete DTOs.
    let mapper: { map: jest.Mock; mapArray: jest.Mock }

    const id = 'some-uuid'

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProxyService,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        findOneBy: jest.fn(),
                        find: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
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

        service = module.get(ProxyService)
        repo = module.get(getRepositoryToken(Proxy))
        mapper = module.get(getMapperToken())
    })

    beforeEach(() => jest.resetAllMocks())

    describe('update', () => {
        it('should update and return the updated proxy', async () => {
            const entity: Proxy = { id, host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const updateDto = { host: 'new.example.com' }
            const updated = { ...entity, ...updateDto }
            const mappedResponse = { id, host: 'new.example.com' } as ProxyResponse

            repo.findOneBy.mockResolvedValue(entity)
            repo.save.mockResolvedValue(updated)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.update(id, updateDto)

            expect(repo.findOneBy).toHaveBeenCalledWith({ id })
            expect(repo.save).toHaveBeenCalled()
            expect(mapper.map).toHaveBeenCalledWith(updated, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            repo.findOneBy.mockResolvedValue(null)

            await expect(service.update(id, { host: 'new.example.com' })).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('create', () => {
        it('should create a new proxy and return the created proxy', async () => {
            const createDto = { host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const entity: Proxy = { id, ...createDto }
            const mappedResponse = { id, ...createDto } as ProxyResponse

            repo.create.mockReturnValue(entity)
            repo.save.mockResolvedValue(entity)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.create(createDto)

            expect(repo.create).toHaveBeenCalledWith(createDto)
            expect(repo.save).toHaveBeenCalledWith(entity)
            expect(mapper.map).toHaveBeenCalledWith(entity, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })
    })

    describe('remove', () => {
        it('should remove and return the removed proxy', async () => {
            const entity: Proxy = { id, host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const mappedResponse = { id, host: 'example.com' } as ProxyResponse

            repo.findOneBy.mockResolvedValue(entity)
            repo.remove.mockResolvedValue(entity)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.remove(id)

            expect(repo.findOneBy).toHaveBeenCalledWith({ id })
            expect(repo.remove).toHaveBeenCalledWith(entity)
            expect(mapper.map).toHaveBeenCalledWith(entity, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            repo.findOneBy.mockResolvedValue(null)

            await expect(service.remove(id)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('addToBlacklist', () => {
        it('should add a blacklist item and return updated proxy', async () => {
            const blacklist = 'test-blacklist'
            const entity: Proxy = { id, host: 'example.com', type: ProxyType.HTTP, port: 8080, blacklists: [] }
            const updated = { ...entity, blacklists: [blacklist] }
            const mappedResponse = { id, blacklists: [blacklist] } as ProxyResponse

            repo.findOneBy.mockResolvedValue(entity)
            repo.save.mockResolvedValue(updated)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.addToBlacklist(id, blacklist)

            expect(repo.findOneBy).toHaveBeenCalledWith({ id })
            expect(repo.save).toHaveBeenCalled()
            expect(result).toEqual(mappedResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            repo.findOneBy.mockResolvedValue(null)

            await expect(service.addToBlacklist(id, 'blacklist')).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('getById', () => {
        it('should return proxy by ID', async () => {
            const entity: Proxy = { id, host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const mappedResponse = { id, host: 'example.com' } as ProxyResponse

            repo.findOneBy.mockResolvedValue(entity)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.getById(id)

            expect(repo.findOneBy).toHaveBeenCalledWith({ id })
            expect(mapper.map).toHaveBeenCalledWith(entity, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            repo.findOneBy.mockResolvedValue(null)

            await expect(service.getById(id)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('get', () => {
        it('should return all proxies when no excluded exchanges', async () => {
            const proxies: Proxy[] = [{ id, host: 'example.com', type: ProxyType.HTTP, port: 8080 }]
            const mappedResponse = [{ id, host: 'example.com' }] as ProxyResponse[]

            repo.find.mockResolvedValue(proxies)
            mapper.mapArray.mockReturnValue(mappedResponse)

            const result = await service.get()

            expect(repo.find).toHaveBeenCalled()
            expect(mapper.mapArray).toHaveBeenCalledWith(proxies, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })

        it('should use query builder when excluded exchanges provided', async () => {
            const proxies: Proxy[] = [{ id, host: 'example.com', type: ProxyType.HTTP, port: 8080 }]
            const mappedResponse = [{ id, host: 'example.com' }] as ProxyResponse[]
            const qb = {
                where: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue(proxies),
            } as unknown as SelectQueryBuilder<Proxy>

            repo.createQueryBuilder.mockReturnValue(qb)
            mapper.mapArray.mockReturnValue(mappedResponse)

            const result = await service.get(['mx.example.com'])

            expect(repo.createQueryBuilder).toHaveBeenCalledWith('p')
            expect(mapper.mapArray).toHaveBeenCalledWith(proxies, Proxy, ProxyResponse)
            expect(result).toEqual(mappedResponse)
        })
    })
})
