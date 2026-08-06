import { Test } from '@nestjs/testing'
import { ProxyService } from './proxy.service'
import { getModelToken } from '@nestjs/mongoose'
import { Proxy } from './proxy.schema'
import { getMapperToken } from '@automapper/nestjs'
import { CommandBus } from '@nestjs/cqrs'
import { Types } from 'mongoose'
import { BadRequestException } from '@nestjs/common'
import { ProxyNotFoundException } from './proxy-not-found.exception'

describe('ProxyService', () => {
    let service: ProxyService
    let proxyModel: {
        findById: jest.Mock
        find: jest.Mock
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
                    provide: CommandBus,
                    useValue: {
                        execute: jest.fn(),
                    },
                },
                {
                    provide: getModelToken(Proxy.name),
                    useValue: {
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

        service = moduleRef.get(ProxyService)
        proxyModel = moduleRef.get(getModelToken(Proxy.name))
        mapper = moduleRef.get(getMapperToken())
    })

    describe('getProxy', () => {
        it('returns the mapped proxy', async () => {
            const id = new Types.ObjectId()
            const proxy = { _id: id } as Proxy
            const descriptor = { id: id.toHexString() }
            proxyModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proxy) })
            mapper.map.mockReturnValue(descriptor)

            await expect(service.getProxy({ id: id.toHexString() })).resolves.toEqual({ proxy: descriptor })
            expect(proxyModel.findById).toHaveBeenCalledWith(id.toHexString())
            expect(mapper.map).toHaveBeenCalledWith(proxy, Proxy, expect.any(Function))
        })

        it('throws when the proxy does not exist', async () => {
            const id = new Types.ObjectId().toHexString()
            proxyModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })

            await expect(service.getProxy({ id })).rejects.toBeInstanceOf(ProxyNotFoundException)
        })
    })

    describe('listProxies', () => {
        it('returns a page and a cursor for the next page', async () => {
            const first = { _id: new Types.ObjectId() } as Proxy
            const second = { _id: new Types.ObjectId() } as Proxy
            const third = { _id: new Types.ObjectId() } as Proxy
            const exec = jest.fn().mockResolvedValue([first, second, third])
            const limit = jest.fn().mockReturnValue({ exec })
            const sort = jest.fn().mockReturnValue({ limit })
            proxyModel.find.mockReturnValue({ sort })
            mapper.mapArray.mockReturnValue([{ id: first._id.toHexString() }, { id: second._id.toHexString() }])

            await expect(service.listProxies({ pageSize: 2 })).resolves.toEqual({
                proxies: [{ id: first._id.toHexString() }, { id: second._id.toHexString() }],
                nextPageToken: second._id.toHexString(),
            })
            expect(proxyModel.find).toHaveBeenCalledWith({})
            expect(sort).toHaveBeenCalledWith({ _id: 1 })
            expect(limit).toHaveBeenCalledWith(3)
        })

        it('rejects an invalid page token', async () => {
            await expect(service.listProxies({ pageSize: 10, pageToken: 'not-an-object-id' })).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })
    })
})
