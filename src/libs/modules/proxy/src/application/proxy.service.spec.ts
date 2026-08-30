import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyRecord } from '../domain/proxy-record'
import { ProxyRepository } from './ports/proxy-repository'
import { ProxyNotFoundError } from './proxy-not-found.error'
import { ProxyService, ProxyValidationError } from './proxy.service'

function record(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
    return {
        id: '6d7983d6-3eba-4eb7-bd8f-ebef258faeca',
        protocol: ProxyProtocol.HTTP,
        host: 'proxy.example.com',
        port: 8080,
        state: ProxyLifecycle.DISABLED,
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('ProxyService', () => {
    let repository: jest.Mocked<ProxyRepository>
    let service: ProxyService

    beforeEach(() => {
        repository = {
            create: jest.fn(),
            findById: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            addBlacklist: jest.fn(),
            findActiveNotBlacklistedFor: jest.fn(),
            findAllActive: jest.fn(),
            findActiveExcluding: jest.fn(),
        }
        service = new ProxyService(repository)
    })

    describe('createProxy', () => {
        it('applies the default lifecycle and capacity values', async () => {
            repository.create.mockResolvedValue(record())

            await service.createProxy({ protocol: ProxyProtocol.HTTP, host: 'proxy.example.com', port: 8080 })

            expect(repository.create).toHaveBeenCalledWith({
                protocol: ProxyProtocol.HTTP,
                host: 'proxy.example.com',
                port: 8080,
                state: ProxyLifecycle.DISABLED,
                weight: 1,
                maxConcurrent: 1,
                requestsPerMinute: 10,
            })
        })

        it('preserves an explicitly active lifecycle state', async () => {
            repository.create.mockResolvedValue(record({ state: ProxyLifecycle.ACTIVE }))

            await service.createProxy({
                protocol: ProxyProtocol.HTTP,
                host: 'proxy.example.com',
                port: 8080,
                state: ProxyLifecycle.ACTIVE,
            })

            expect(repository.create).toHaveBeenCalledWith(
                expect.objectContaining({ state: ProxyLifecycle.ACTIVE }),
            )
        })
    })

    describe('getProxy', () => {
        it('returns the proxy record', async () => {
            const proxy = record()
            repository.findById.mockResolvedValue(proxy)

            await expect(service.getProxy(proxy.id)).resolves.toBe(proxy)
            expect(repository.findById).toHaveBeenCalledWith(proxy.id)
        })

        it('throws ProxyNotFoundError when the proxy does not exist', async () => {
            repository.findById.mockResolvedValue(undefined)

            await expect(service.getProxy('missing-id')).rejects.toBeInstanceOf(ProxyNotFoundError)
        })
    })

    describe('listProxies', () => {
        it('returns a page and a cursor for the next page', async () => {
            const first = record({ id: '1d7983d6-3eba-4eb7-bd8f-ebef258faeca' })
            const second = record({ id: '2d7983d6-3eba-4eb7-bd8f-ebef258faeca' })
            const third = record({ id: '3d7983d6-3eba-4eb7-bd8f-ebef258faeca' })
            repository.list.mockResolvedValue([first, second, third])

            await expect(service.listProxies({ pageSize: 2 })).resolves.toEqual({
                proxies: [first, second],
                nextPageToken: second.id,
            })
            expect(repository.list).toHaveBeenCalledWith(3, undefined)
        })

        it('rejects an invalid page token', async () => {
            await expect(service.listProxies({ pageSize: 10, pageToken: 'not-a-uuid' })).rejects.toBeInstanceOf(
                ProxyValidationError,
            )
            expect(repository.list).not.toHaveBeenCalled()
        })
    })

    describe('updateProxy', () => {
        it('updates only fields in the update mask', async () => {
            const updated = record({ host: 'new-host' })
            repository.update.mockResolvedValue(updated)

            await expect(service.updateProxy(updated.id, { host: 'new-host' })).resolves.toBe(updated)
            expect(repository.update).toHaveBeenCalledWith(updated.id, { host: 'new-host' })
        })

        it('rejects an empty update mask', async () => {
            await expect(service.updateProxy('proxy-id', {})).rejects.toBeInstanceOf(ProxyValidationError)
            expect(repository.update).not.toHaveBeenCalled()
        })

        it('throws ProxyNotFoundError when the proxy does not exist', async () => {
            repository.update.mockResolvedValue(undefined)

            await expect(service.updateProxy('missing-id', { host: 'new-host' })).rejects.toBeInstanceOf(
                ProxyNotFoundError,
            )
        })
    })

    describe('deleteProxy', () => {
        it('removes and returns the proxy', async () => {
            const proxy = record()
            repository.delete.mockResolvedValue(proxy)

            await expect(service.deleteProxy(proxy.id)).resolves.toBe(proxy)
            expect(repository.delete).toHaveBeenCalledWith(proxy.id)
        })

        it('throws ProxyNotFoundError when the proxy does not exist', async () => {
            repository.delete.mockResolvedValue(undefined)

            await expect(service.deleteProxy('missing-id')).rejects.toBeInstanceOf(ProxyNotFoundError)
        })
    })

    describe('getHealthyProxy', () => {
        it('selects an active proxy that is not blacklisted for the MX host', async () => {
            const proxy = record({ weight: 1 })
            repository.findActiveNotBlacklistedFor.mockResolvedValue([proxy])

            await expect(service.getHealthyProxy('mx.example.com')).resolves.toBe(proxy)
            expect(repository.findActiveNotBlacklistedFor).toHaveBeenCalledWith('mx.example.com')
        })

        it('returns undefined when there are no eligible proxies', async () => {
            repository.findActiveNotBlacklistedFor.mockResolvedValue([])

            await expect(service.getHealthyProxy('mx.example.com')).resolves.toBeUndefined()
        })
    })

    describe('reportProxyBlacklist', () => {
        it('adds the MX host', async () => {
            repository.addBlacklist.mockResolvedValue(record({ blacklists: ['mx.example.com'] }))

            await expect(service.reportProxyBlacklist('proxy-id', { mxHost: 'mx.example.com' })).resolves.toBeUndefined()
            expect(repository.addBlacklist).toHaveBeenCalledWith('proxy-id', 'mx.example.com')
        })

        it('throws ProxyNotFoundError when the proxy does not exist', async () => {
            repository.addBlacklist.mockResolvedValue(undefined)

            await expect(
                service.reportProxyBlacklist('missing-id', { mxHost: 'mx.example.com' }),
            ).rejects.toBeInstanceOf(ProxyNotFoundError)
        })
    })
})
