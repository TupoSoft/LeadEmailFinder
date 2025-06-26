import { Test } from '@nestjs/testing'
import { ListProxiesHandler } from '../handlers/list-proxies.handler'
import { ListProxiesQuery } from '../queries/list-proxies.query'
import { getModelToken } from '@nestjs/mongoose'
import { Proxy } from '../proxy.schema'
import { getMapperToken } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { Model } from 'mongoose'
import { ProxyDescriptor } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { ProxyDescriptorDto } from '../proxy.dto'
import { createRandomProxy } from './create-random-proxy'

describe('ListProxiesHandler', () => {
    let handler: ListProxiesHandler
    let mapper: jest.Mocked<Mapper>
    let proxyModel: jest.Mocked<Model<Proxy>>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ListProxiesHandler,
                {
                    provide: getModelToken(Proxy.name, 'proxy'),
                    useValue: {
                        find: jest.fn(),
                    },
                },
                {
                    provide: getMapperToken(),
                    useValue: {
                        mapArray: jest.fn(),
                    },
                },
            ],
        }).compile()

        handler = moduleRef.get(ListProxiesHandler)
        mapper = moduleRef.get(getMapperToken())
        proxyModel = moduleRef.get(getModelToken(Proxy.name, 'proxy'))
    })

    test('should return a list of proxies and no paging', async () => {
        const limitMock = jest.fn().mockReturnThis()
        const leanMock = jest.fn().mockReturnThis()
        const execMock = jest.fn()

        const listProxiesQuery = new ListProxiesQuery(2, undefined)

        const proxyDocuments: Proxy[] = Array.from({ length: 2 }, createRandomProxy)
        const proxies: ProxyDescriptor[] = []

        for (const { _id, ...proxyDoc } of proxyDocuments) {
            proxies.push({ id: _id.toHexString(), auth: undefined, description: '', ...proxyDoc })
        }

        proxyModel.find.mockReturnValue({
            limit: limitMock,
            lean: leanMock,
            exec: execMock.mockResolvedValue(proxyDocuments),
        } as any)

        mapper.mapArray.mockReturnValue(proxies as any)

        const result = await handler.execute(listProxiesQuery)

        expect(proxyModel.find).toHaveBeenCalledWith({})
        expect(limitMock).toHaveBeenCalledWith(3)
        expect(leanMock).toHaveBeenCalled()
        expect(execMock).toHaveBeenCalled()
        expect(mapper.mapArray).toHaveBeenCalledWith(proxyDocuments, Proxy, ProxyDescriptorDto)
        expect(result).toEqual({ proxies, nextPageToken: '' })
    })
})
