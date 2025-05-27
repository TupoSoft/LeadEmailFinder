import { Test, TestingModule } from '@nestjs/testing'
import { ProxyService } from './proxy.service'
import { getModelToken } from '@nestjs/mongoose'
import { Mapper } from '@automapper/core'
import { Model, Types } from 'mongoose'
import { Proxy } from './proxy.schema'
import { getMapperToken } from '@automapper/nestjs'
import { ProxyResponse } from './proxy-response.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'
import { ProxyType } from './proxy-type.enum'

describe('ProxyService', () => {
    let service: ProxyService
    let model: jest.Mocked<Model<Proxy>>
    let mapper: jest.Mocked<Mapper>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProxyService,
                {
                    provide: getModelToken(Proxy.name),
                    useValue: {
                        findByIdAndUpdate: jest.fn(),
                        findByIdAndDelete: jest.fn(),
                        findById: jest.fn(),
                        find: jest.fn(),
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
        model = module.get(getModelToken(Proxy.name))
        mapper = module.get(getMapperToken())
    })

    describe('update', () => {
        it('should update and return the updated proxy', async () => {
            const id = new Types.ObjectId().toString()
            const updateProxyDto = { host: 'new.example.com' }
            const updatedProxy = { _id: id, host: 'new.example.com' }
            const mappedResponse = { id, host: 'new.example.com' }

            model.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedProxy) } as any)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.update(id, updateProxyDto)

            expect(result).toEqual(mappedResponse)
            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(id, updateProxyDto, { new: true })
            expect(mapper.map).toHaveBeenCalledWith(updatedProxy, Proxy, ProxyResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            const id = new Types.ObjectId().toString()
            const updateProxyDto = { host: 'new.example.com' }

            model.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)

            await expect(service.update(id, updateProxyDto)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('create', () => {
        it('should create a new proxy and return the created proxy', async () => {
            const createProxyDto = { host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const createdProxy = { _id: 'someId', host: 'example.com', type: ProxyType.HTTP, port: 8080 }
            const mappedResponse = { id: 'someId', host: 'example.com', type: ProxyType.HTTP, port: 8080 }

            model.insertOne = jest.fn().mockResolvedValue(createdProxy)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.create(createProxyDto)

            expect(result).toEqual(mappedResponse)
            expect(model.insertOne).toHaveBeenCalledWith(createProxyDto)
            expect(mapper.map).toHaveBeenCalledWith(createdProxy, Proxy, ProxyResponse)
        })
    })

    describe('remove', () => {
        it('should remove and return the removed proxy', async () => {
            const id = new Types.ObjectId().toString()
            const removedProxy = { _id: id, host: 'removed.example.com' }
            const mappedResponse = { id, host: 'removed.example.com' }

            model.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(removedProxy) } as any)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.remove(id)

            expect(result).toEqual(mappedResponse)
            expect(model.findByIdAndDelete).toHaveBeenCalledWith(id)
            expect(mapper.map).toHaveBeenCalledWith(removedProxy, Proxy, ProxyResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            const id = new Types.ObjectId().toString()

            model.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)

            await expect(service.remove(id)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('addToBlacklist', () => {
        it('should add a blacklist item and return updated proxy', async () => {
            const id = new Types.ObjectId().toString()
            const blacklist = 'test-blacklist'
            const updatedProxy = { _id: id, blacklists: [blacklist] }
            const mappedResponse = { id, blacklists: [blacklist] }

            model.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedProxy) } as any)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.addToBlacklist(id, blacklist)

            expect(result).toEqual(mappedResponse)
            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
                id,
                { $addToSet: { blacklists: blacklist } },
                { new: true, upsert: false },
            )
            expect(mapper.map).toHaveBeenCalledWith(updatedProxy, Proxy, ProxyResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            const id = new Types.ObjectId().toString()
            const blacklist = 'test-blacklist'

            model.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)

            await expect(service.addToBlacklist(id, blacklist)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('getById', () => {
        it('should return proxy by ID', async () => {
            const id = new Types.ObjectId().toString()
            const foundProxy = { _id: id, host: 'example.com' }
            const mappedResponse = { id, host: 'example.com' }

            model.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(foundProxy) } as any)
            mapper.map.mockReturnValue(mappedResponse)

            const result = await service.getById(id)

            expect(result).toEqual(mappedResponse)
            expect(model.findById).toHaveBeenCalledWith(id)
            expect(mapper.map).toHaveBeenCalledWith(foundProxy, Proxy, ProxyResponse)
        })

        it('should throw ProxyNotFoundException if proxy is not found', async () => {
            const id = new Types.ObjectId().toString()

            model.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)

            await expect(service.getById(id)).rejects.toThrow(ProxyNotFoundException)
        })
    })

    describe('get', () => {
        it('should return all proxies matching the filter', async () => {
            const filter = { host: { $regex: 'example' } }
            const foundProxies = [{ _id: '1', host: 'example.com' }]
            const mappedResponse = [{ id: '1', host: 'example.com' }]

            model.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(foundProxies) } as any)
            mapper.mapArray.mockReturnValue(mappedResponse)

            const result = await service.get(filter)

            expect(result).toEqual(mappedResponse)
            expect(model.find).toHaveBeenCalledWith(filter)
            expect(mapper.mapArray).toHaveBeenCalledWith(foundProxies, Proxy, ProxyResponse)
        })
    })
})
