import type { FleetInventory } from './inventory'
import type { ListenerEgressCheckTarget, SmtpProbeEndpoint } from './listener-health-check'
import {
    type DesiredProxyRecord,
    OWNED_DESCRIPTION_PREFIX,
    type OwnedProxyRecord,
    ownedDescriptionFor,
    type ProxyRecordPatch,
    type ProxyRegistryAdminPort,
    type ProxyState,
} from './proxy-registry-admin'
import { type DesiredFleetListener, desiredListenersFrom, reconcile, ReconcileError } from './reconcile'

class FakeProxyRegistryAdmin implements ProxyRegistryAdminPort {
    private nextId = 1
    readonly records = new Map<string, OwnedProxyRecord>()
    readonly updateCalls: { id: string; patch: ProxyRecordPatch }[] = []

    seed(record: Omit<OwnedProxyRecord, 'id'> & { id?: string }): OwnedProxyRecord {
        const id = record.id ?? `seed-${this.nextId++}`
        const full = { ...record, id }
        this.records.set(id, full)
        return full
    }

    listOwnedProxies(): Promise<OwnedProxyRecord[]> {
        return Promise.resolve(
            [...this.records.values()].filter(record => record.description.startsWith(OWNED_DESCRIPTION_PREFIX)),
        )
    }

    createDisabled(desired: DesiredProxyRecord): Promise<OwnedProxyRecord> {
        const id = `created-${this.nextId++}`
        const record: OwnedProxyRecord = {
            id,
            protocol: desired.protocol,
            host: desired.host,
            port: desired.port,
            state: 'disabled',
            weight: desired.weight,
            maxConcurrent: desired.maxConcurrent,
            requestsPerMinute: desired.requestsPerMinute,
            description: ownedDescriptionFor(desired.egressId),
        }
        this.records.set(id, record)
        return Promise.resolve(record)
    }

    update(id: string, patch: ProxyRecordPatch): Promise<void> {
        this.updateCalls.push({ id, patch })
        const existing = this.records.get(id)
        if (existing === undefined) throw new Error(`no such record ${id}`)
        this.records.set(id, { ...existing, ...patch })
        return Promise.resolve()
    }

    transitionState(id: string, state: ProxyState): Promise<void> {
        const existing = this.records.get(id)
        if (existing === undefined) throw new Error(`no such record ${id}`)
        this.records.set(id, { ...existing, state })
        return Promise.resolve()
    }
}

const probe: SmtpProbeEndpoint = { host: '172.29.23.3', port: 2525, statusUrl: 'http://probe/last-peer' }

function listener(overrides: Partial<DesiredFleetListener> = {}): DesiredFleetListener {
    return {
        egressId: 'egress-a',
        bindIp: '172.29.10.2',
        port: 13001,
        egressIp: '203.0.113.21',
        desiredState: 'active',
        weight: 1,
        maxConcurrent: 20,
        requestsPerMinute: 300,
        auth: { user: 'egress-a', pass: 'secret-a' },
        ...overrides,
    }
}

function alwaysHealthy(): jest.Mock {
    return jest.fn().mockResolvedValue(true)
}

function neverHealthy(): jest.Mock {
    return jest.fn().mockResolvedValue(false)
}

describe('reconcile', () => {
    it('creates a missing listener disabled, then activates it once health validation succeeds', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const healthCheck = alwaysHealthy()

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['created-disabled', 'activated'])
        const record = [...registry.records.values()][0]
        expect(record.state).toBe('active')
        expect(healthCheck).toHaveBeenCalledTimes(1)
    })

    it('creates a missing listener and leaves it disabled when health validation fails', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const healthCheck = neverHealthy()

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['created-disabled', 'health-check-failed'])
        const record = [...registry.records.values()][0]
        expect(record.state).toBe('disabled')
    })

    it('creates a listener with desiredState disabled without running a health check', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const healthCheck = jest.fn()

        const summary = await reconcile([listener({ desiredState: 'disabled' })], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['created-disabled'])
        expect(healthCheck).not.toHaveBeenCalled()
    })

    it('reactivates a draining listener once health validation succeeds again', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'draining',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = alwaysHealthy()

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['activated'])
        expect([...registry.records.values()][0].state).toBe('active')
    })

    it('demotes an active listener to draining when health validation fails', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = neverHealthy()

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['health-check-failed'])
        expect([...registry.records.values()][0].state).toBe('draining')
    })

    it('keeps a disabled listener disabled (not draining) when health validation fails again', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'disabled',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = neverHealthy()

        await reconcile([listener()], { registry, healthCheck, probe })

        expect([...registry.records.values()][0].state).toBe('disabled')
    })

    it('forces an active listener to disabled when desiredState is disabled, without a health check', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = jest.fn()

        const summary = await reconcile([listener({ desiredState: 'disabled' })], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['disabled'])
        expect(healthCheck).not.toHaveBeenCalled()
        expect([...registry.records.values()][0].state).toBe('disabled')
    })

    it('is a no-op for an already-active, already-correct listener', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = alwaysHealthy()

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['unchanged'])
        expect(registry.updateCalls).toHaveLength(0)
    })

    it('is a no-op for an already-disabled, already-correct listener with desiredState disabled', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'disabled',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = jest.fn()

        const summary = await reconcile([listener({ desiredState: 'disabled' })], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['unchanged'])
        expect(registry.updateCalls).toHaveLength(0)
    })

    it('updates changed weight/capacity fields and bundles credentials in the same call', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = alwaysHealthy()

        const summary = await reconcile([listener({ weight: 5 })], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['updated-fields'])
        expect(registry.updateCalls).toEqual([{ id: expect.any(String), patch: { weight: 5, auth: { user: 'egress-a', pass: 'secret-a' } } }])
    })

    it('never issues an update call for an unchanged listener purely because credentials cannot be observed', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-a'),
        })
        const healthCheck = alwaysHealthy()

        await reconcile([listener()], { registry, healthCheck, probe })

        expect(registry.updateCalls).toHaveLength(0)
    })

    it('marks an owned listener no longer in inventory as draining and never deletes it', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.9',
            port: 13009,
            state: 'active',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-removed'),
        })

        const summary = await reconcile([], { registry, healthCheck: alwaysHealthy(), probe })

        expect(summary.actions.map(a => a.type)).toEqual(['drained'])
        expect([...registry.records.values()][0].state).toBe('draining')
    })

    it('is a no-op for a removed listener that is already draining', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.9',
            port: 13009,
            state: 'draining',
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
            description: ownedDescriptionFor('egress-removed'),
        })

        const summary = await reconcile([], { registry, healthCheck: alwaysHealthy(), probe })

        expect(summary.actions.map(a => a.type)).toEqual(['unchanged'])
    })

    it('never touches a manually created record without the owned description prefix', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.50',
            port: 9999,
            state: 'active',
            weight: 1,
            maxConcurrent: 1,
            requestsPerMinute: 10,
            description: 'manually added by an operator',
        })

        const summary = await reconcile([], { registry, healthCheck: alwaysHealthy(), probe })

        expect(summary.actions).toHaveLength(0)
        expect([...registry.records.values()][0].state).toBe('active')
    })

    it('a second reconciliation of unchanged desired state issues no mutations', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const healthCheck = alwaysHealthy()

        await reconcile([listener()], { registry, healthCheck, probe })
        const countAfterFirst = registry.records.size
        const updateCallsAfterFirst = registry.updateCalls.length

        const summary = await reconcile([listener()], { registry, healthCheck, probe })

        expect(summary.actions.map(a => a.type)).toEqual(['unchanged'])
        expect(registry.records.size).toBe(countAfterFirst)
        expect(registry.updateCalls.length).toBe(updateCallsAfterFirst)
    })

    it('rejects duplicate desired endpoints before any mutation', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const desired = [listener(), listener({ egressId: 'egress-b', egressIp: '203.0.113.22' })]

        await expect(reconcile(desired, { registry, healthCheck: alwaysHealthy(), probe })).rejects.toThrow(
            ReconcileError,
        )
        expect(registry.records.size).toBe(0)
    })

    it('rejects duplicate owned registry endpoints before any mutation', async () => {
        const registry = new FakeProxyRegistryAdmin()
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 1,
            requestsPerMinute: 10,
            description: ownedDescriptionFor('egress-a'),
        })
        registry.seed({
            protocol: 1,
            host: '172.29.10.2',
            port: 13001,
            state: 'active',
            weight: 1,
            maxConcurrent: 1,
            requestsPerMinute: 10,
            description: ownedDescriptionFor('egress-a-dupe'),
        })

        await expect(reconcile([listener()], { registry, healthCheck: alwaysHealthy(), probe })).rejects.toThrow(
            ReconcileError,
        )
    })

    it('runs health checks sequentially, one listener at a time', async () => {
        const registry = new FakeProxyRegistryAdmin()
        const order: string[] = []
        const healthCheck = jest.fn(async (target: ListenerEgressCheckTarget) => {
            order.push(`start:${target.egressId}`)
            await new Promise(resolve => setTimeout(resolve, 5))
            order.push(`end:${target.egressId}`)
            return true
        })

        await reconcile(
            [listener({ egressId: 'egress-a' }), listener({ egressId: 'egress-b', bindIp: '172.29.10.3', egressIp: '203.0.113.22' })],
            { registry, healthCheck, probe },
        )

        expect(order).toEqual(['start:egress-a', 'end:egress-a', 'start:egress-b', 'end:egress-b'])
    })
})

describe('desiredListenersFrom', () => {
    function inventory(): FleetInventory {
        return {
            nodes: [
                {
                    hostname: 'proxy-node-a.example.invalid',
                    proxyNodeId: 'proxy-node-a',
                    egressInterface: 'eth1',
                    wireguardAddress: '172.29.10.2/28',
                    listeners: [
                        {
                            egressId: 'egress-a',
                            bindIp: '172.29.10.2',
                            port: 13001,
                            egressIp: '203.0.113.21',
                            maxConnections: 50,
                            maxConcurrent: 20,
                            requestsPerMinute: 300,
                            weight: 1,
                            desiredState: 'active',
                        },
                    ],
                },
            ],
            workerCidrs: ['172.29.10.0/28'],
            allowedDestinationPorts: [2525],
        }
    }

    it('joins listeners with their staged credentials', () => {
        const listeners = desiredListenersFrom(
            inventory(),
            new Map([['proxy-node-a', { 'egress-a': { user: 'egress-a', pass: 'secret' } }]]),
        )

        expect(listeners).toEqual([
            {
                egressId: 'egress-a',
                bindIp: '172.29.10.2',
                port: 13001,
                egressIp: '203.0.113.21',
                desiredState: 'active',
                weight: 1,
                maxConcurrent: 20,
                requestsPerMinute: 300,
                auth: { user: 'egress-a', pass: 'secret' },
            },
        ])
    })

    it('throws when a listener has no staged credentials', () => {
        expect(() => desiredListenersFrom(inventory(), new Map())).toThrow(ReconcileError)
    })
})
