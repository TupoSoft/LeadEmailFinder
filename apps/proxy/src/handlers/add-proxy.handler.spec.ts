import { Model, Types } from 'mongoose'
import { Proxy } from '../proxy.schema'
import { Test } from '@nestjs/testing'
import { AddProxyHandler } from './add-proxy.handler'
import { getModelToken } from '@nestjs/mongoose'
import { getMapperToken } from '@automapper/nestjs'
import { AddProxyCommand } from '../commands/add-proxy.command'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'

describe('AddProxyHandler', () => {
    let addProxyHandler: AddProxyHandler
    let proxyModel: jest.Mocked<Model<Proxy>>
    let mapper: jest.Mocked<Mapper>

    const now = new Date()

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                AddProxyHandler,
                {
                    provide: getModelToken(Proxy.name, 'proxy'),
                    useValue: {
                        insertOne: jest.fn(),
                    },
                },
                {
                    provide: getMapperToken(),
                    useValue: {
                        map: jest.fn(),
                    },
                },
            ],
        }).compile()

        addProxyHandler = moduleRef.get(AddProxyHandler)
        mapper = moduleRef.get(getMapperToken())
        proxyModel = moduleRef.get(getModelToken(Proxy.name, 'proxy'))
    })

    it('should call proxyModel.insertOne with the correct data', async () => {
        const command = new AddProxyCommand(1, 'localhost', 80, undefined, '')

        const insertOneResult: Proxy = {
            _id: new Types.ObjectId(),
            createdAt: now,
            enabled: true,
            host: 'localhost',
            port: 80,
            protocol: 1,
            updatedAt: now,
            weight: 1,
        }

        proxyModel.insertOne.mockResolvedValueOnce(insertOneResult as any)

        await addProxyHandler.execute(command)

        expect(proxyModel.insertOne).toHaveBeenCalledWith(command)
    })

    it('should call mapper.map with the correct arguments and return the expected result', async () => {
        const command = new AddProxyCommand(1, 'localhost', 80, undefined, '')

        const insertOneResult: Proxy = {
            _id: new Types.ObjectId(),
            createdAt: now,
            enabled: true,
            host: 'localhost',
            port: 80,
            protocol: 1,
            updatedAt: now,
            weight: 1,
        }

        const mappedResult = {
            id: insertOneResult._id.toHexString(),
            createdAt: now,
            enabled: true,
            host: 'localhost',
            port: 80,
            protocol: 1,
            updatedAt: now,
            weight: 1,
        }

        proxyModel.insertOne.mockResolvedValueOnce(insertOneResult as any)
        mapper.map.mockReturnValue(mappedResult)

        const result = await addProxyHandler.execute(command)

        expect(mapper.map).toHaveBeenCalledWith(insertOneResult, Proxy, ProxyDescriptorDto)
        expect(result.proxy).toEqual(mappedResult)
    })

    it('should throw an error if insertOne fails', async () => {
        const command = new AddProxyCommand(1, 'localhost', 80, undefined, '')

        const error = new Error('Database error')
        proxyModel.insertOne.mockRejectedValueOnce(error)

        await expect(addProxyHandler.execute(command)).rejects.toThrow('Database error')
    })
})
