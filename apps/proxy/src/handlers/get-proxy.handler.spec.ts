import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { Logger } from '@nestjs/common'
import { GetProxyHandler } from './get-proxy.handler'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { GetProxyQuery } from '../queries/get-proxy.query'
import { Proxy } from '../proxy.schema'
import { Model } from 'mongoose'
import { ProxyNotFoundException } from '../proxy-not-found.exception'

describe('GetProxyHandler', () => {
    let handler: GetProxyHandler
    let proxyModel: jest.Mocked<Model<Proxy>>
    let mapper: jest.Mocked<Mapper>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                GetProxyHandler,
                {
                    provide: getModelToken(Proxy.name, 'proxy'),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: getMapperToken(),
                    useValue: {
                        map: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        error: jest.fn(),
                    },
                },
            ],
        }).compile()

        handler = moduleRef.get<GetProxyHandler>(GetProxyHandler)
        proxyModel = moduleRef.get(getModelToken(Proxy.name, 'proxy'))
        mapper = moduleRef.get(getMapperToken())
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should return the proxy when found', async () => {
        const query = new GetProxyQuery('1')
        const mockProxy = { _id: '1', host: 'localhost', port: 8080 }
        const mockProxyDto = { id: '1', host: 'localhost', port: 8080 }

        proxyModel.findOne.mockResolvedValueOnce(mockProxy)
        mapper.map.mockReturnValueOnce(mockProxyDto)

        const result = await handler.execute(query)

        expect(proxyModel.findOne).toHaveBeenCalledWith({ _id: '1' })
        expect(mapper.map).toHaveBeenCalledWith(mockProxy, Proxy, expect.anything())
        expect(result).toEqual({ proxy: mockProxyDto })
    })

    it('should throw ProxyNotFoundException when proxy is not found', async () => {
        const query = new GetProxyQuery('2')

        proxyModel.findOne.mockResolvedValueOnce(null)

        await expect(handler.execute(query)).rejects.toThrow(ProxyNotFoundException)
        expect(proxyModel.findOne).toHaveBeenCalledWith({ _id: '2' })
        expect(mapper.map).not.toHaveBeenCalled()
    })

    it('should handle errors while querying the database', async () => {
        const query = new GetProxyQuery('3')
        const error = new Error('Database error')

        proxyModel.findOne.mockRejectedValueOnce(error)

        await expect(handler.execute(query)).rejects.toThrow(ProxyNotFoundException)
        expect(proxyModel.findOne).toHaveBeenCalledWith({ _id: '3' })
        expect(mapper.map).not.toHaveBeenCalled()
    })
})
