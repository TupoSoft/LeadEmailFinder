import { Repository } from 'typeorm'
import { Proxy } from '../proxy.entity'
import { Test } from '@nestjs/testing'
import { AddProxyHandler } from './add-proxy.handler'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getMapperToken } from '@automapper/nestjs'
import { AddProxyCommand } from './add-proxy.command'

// Protocol.PROTOCOL_HTTP = 1 (from proto enum, avoid importing proto module in tests due to protobufjs side effects)
const PROTOCOL_HTTP = 1

describe('AddProxyHandler', () => {
    let addProxyHandler: AddProxyHandler
    let proxyRepo: jest.Mocked<Pick<Repository<Proxy>, 'save' | 'create'>>

    const now = new Date()

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                AddProxyHandler,
                {
                    provide: getRepositoryToken(Proxy, 'proxy'),
                    useValue: {
                        save: jest.fn(),
                        create: jest.fn(),
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
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy, 'proxy'))
    })

    it('should call proxyRepo.save with the created proxy', async () => {
        const command = new AddProxyCommand(PROTOCOL_HTTP, 'localhost', 80, undefined, '')

        const savedProxy: Proxy = {
            id: 'some-uuid',
            createdAt: now,
            enabled: true,
            host: 'localhost',
            port: 80,
            protocol: PROTOCOL_HTTP,
            updatedAt: now,
            weight: 1,
        }

        proxyRepo.create.mockReturnValue(savedProxy)
        proxyRepo.save.mockResolvedValue(savedProxy)

        await addProxyHandler.execute(command)

        expect(proxyRepo.create).toHaveBeenCalledWith(command)
        expect(proxyRepo.save).toHaveBeenCalledWith(savedProxy)
    })
})
