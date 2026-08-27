import { FleetInventoryValidationError, parseFleetInventory } from './inventory'

function validListener(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        egressId: 'egress-a',
        bindIp: '172.29.10.2',
        port: 13001,
        egressIp: '203.0.113.21',
        maxConnections: 50,
        maxConcurrent: 20,
        requestsPerMinute: 300,
        weight: 1,
        desiredState: 'active',
        ...overrides,
    }
}

function inventoryWith(nodes: Record<string, Record<string, unknown>>): unknown {
    return {
        _meta: { hostvars: nodes },
        proxy_nodes: { hosts: Object.keys(nodes) },
    }
}

function baseNodeVars(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        proxy_node_id: 'proxy-node-a',
        egress_interface: 'eth1',
        wireguard_address: '172.29.10.2/28',
        proxy_listeners: [validListener()],
        proxy_fleet_worker_cidrs: ['172.29.10.0/28'],
        proxy_fleet_allowed_destination_ports: [2525, 587],
        ...overrides,
    }
}

describe('parseFleetInventory', () => {
    it('parses a valid single-node inventory', () => {
        const inventory = parseFleetInventory(inventoryWith({ 'proxy-node-a.example.invalid': baseNodeVars() }))

        expect(inventory.nodes).toHaveLength(1)
        expect(inventory.nodes[0]).toMatchObject({
            hostname: 'proxy-node-a.example.invalid',
            proxyNodeId: 'proxy-node-a',
            egressInterface: 'eth1',
            wireguardAddress: '172.29.10.2/28',
        })
        expect(inventory.nodes[0].listeners).toHaveLength(1)
        expect(inventory.workerCidrs).toEqual(['172.29.10.0/28'])
        expect(inventory.allowedDestinationPorts).toEqual([2525, 587])
    })

    it('parses multiple nodes with distinct listeners', () => {
        const inventory = parseFleetInventory(
            inventoryWith({
                'proxy-node-a.example.invalid': baseNodeVars(),
                'proxy-node-b.example.invalid': baseNodeVars({
                    proxy_node_id: 'proxy-node-b',
                    wireguard_address: '172.29.10.3/28',
                    proxy_listeners: [
                        validListener({ egressId: 'egress-b', bindIp: '172.29.10.3', egressIp: '203.0.113.22' }),
                    ],
                }),
            }),
        )

        expect(inventory.nodes).toHaveLength(2)
    })

    it('rejects an inventory with no proxy_nodes hosts', () => {
        expect(() => parseFleetInventory({ _meta: { hostvars: {} }, proxy_nodes: { hosts: [] } })).toThrow(
            FleetInventoryValidationError,
        )
    })

    it('rejects a node missing proxy_node_id', () => {
        const vars = baseNodeVars({ proxy_node_id: undefined })

        expect(() => parseFleetInventory(inventoryWith({ 'proxy-node-a.example.invalid': vars }))).toThrow(
            /missing proxy_node_id/,
        )
    })

    it('rejects a node with an empty proxy_listeners list', () => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({ 'proxy-node-a.example.invalid': baseNodeVars({ proxy_listeners: [] }) }),
            ),
        ).toThrow(/proxy_listeners must be a non-empty list/)
    })

    it.each([
        ['port', { port: 70000 }, /port must be an integer/],
        ['maxConnections', { maxConnections: 0 }, /maxConnections must be a positive integer/],
        ['maxConcurrent', { maxConcurrent: -1 }, /maxConcurrent must be a positive integer/],
        ['requestsPerMinute', { requestsPerMinute: 0 }, /requestsPerMinute must be a positive integer/],
        ['weight', { weight: -1 }, /weight must be a non-negative integer/],
        ['desiredState', { desiredState: 'maybe' }, /desiredState must be "active" or "disabled"/],
    ])('rejects an invalid listener field: %s', (_field, overrides, expected) => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars({ proxy_listeners: [validListener(overrides)] }),
                }),
            ),
        ).toThrow(expected)
    })

    it('rejects duplicate proxy_node_id across nodes', () => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars(),
                    'proxy-node-a2.example.invalid': baseNodeVars({
                        wireguard_address: '172.29.10.3/28',
                        proxy_listeners: [
                            validListener({ egressId: 'egress-b', bindIp: '172.29.10.3', egressIp: '203.0.113.22' }),
                        ],
                    }),
                }),
            ),
        ).toThrow(/duplicate proxy_node_id: proxy-node-a/)
    })

    it('rejects duplicate egressId across nodes', () => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars(),
                    'proxy-node-b.example.invalid': baseNodeVars({
                        proxy_node_id: 'proxy-node-b',
                        wireguard_address: '172.29.10.3/28',
                        proxy_listeners: [validListener({ bindIp: '172.29.10.3', egressIp: '203.0.113.22' })],
                    }),
                }),
            ),
        ).toThrow(/duplicate egressId: egress-a/)
    })

    it('rejects duplicate listener endpoints across nodes', () => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars(),
                    'proxy-node-b.example.invalid': baseNodeVars({
                        proxy_node_id: 'proxy-node-b',
                        wireguard_address: '172.29.10.3/28',
                        proxy_listeners: [
                            validListener({ egressId: 'egress-b', egressIp: '203.0.113.22' }),
                        ],
                    }),
                }),
            ),
        ).toThrow(/duplicate listener endpoint \(bindIp:port\): 172\.29\.10\.2:13001/)
    })

    it('rejects duplicate egressIp across nodes', () => {
        expect(() =>
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars(),
                    'proxy-node-b.example.invalid': baseNodeVars({
                        proxy_node_id: 'proxy-node-b',
                        wireguard_address: '172.29.10.3/28',
                        proxy_listeners: [
                            validListener({ egressId: 'egress-b', bindIp: '172.29.10.3' }),
                        ],
                    }),
                }),
            ),
        ).toThrow(/duplicate egressIp: 203\.0\.113\.21/)
    })

    it('rejects a missing proxy_fleet_worker_cidrs', () => {
        const vars = baseNodeVars({ proxy_fleet_worker_cidrs: undefined })

        expect(() => parseFleetInventory(inventoryWith({ 'proxy-node-a.example.invalid': vars }))).toThrow(
            /proxy_fleet_worker_cidrs must be a non-empty list/,
        )
    })

    it('rejects a missing proxy_fleet_allowed_destination_ports', () => {
        const vars = baseNodeVars({ proxy_fleet_allowed_destination_ports: undefined })

        expect(() => parseFleetInventory(inventoryWith({ 'proxy-node-a.example.invalid': vars }))).toThrow(
            /proxy_fleet_allowed_destination_ports must be a non-empty list/,
        )
    })

    it('aggregates multiple issues into a single error', () => {
        try {
            parseFleetInventory(
                inventoryWith({
                    'proxy-node-a.example.invalid': baseNodeVars({ proxy_node_id: undefined }),
                }),
            )
            fail('expected parseFleetInventory to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(FleetInventoryValidationError)
            const validationError = error as FleetInventoryValidationError
            expect(validationError.issues.length).toBeGreaterThanOrEqual(1)
        }
    })
})
