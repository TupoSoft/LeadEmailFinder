import { parse } from 'yaml'
import type { FleetInventory } from './inventory'
import { CONTAINER_CREDENTIALS_PATH, CONTAINER_MANIFEST_PATH, OWNER_LABEL, renderStack, StackRenderError } from './stack-renderer'

const DIGEST = 'ghcr.io/tuposoft/lef-3proxy@sha256:' + 'a'.repeat(64)

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
            {
                hostname: 'proxy-node-b.example.invalid',
                proxyNodeId: 'proxy-node-b',
                egressInterface: 'eth1',
                wireguardAddress: '172.29.10.3/28',
                listeners: [
                    {
                        egressId: 'egress-b',
                        bindIp: '172.29.10.3',
                        port: 13001,
                        egressIp: '203.0.113.22',
                        maxConnections: 50,
                        maxConcurrent: 20,
                        requestsPerMinute: 300,
                        weight: 1,
                        desiredState: 'active',
                    },
                    {
                        egressId: 'egress-c',
                        bindIp: '172.29.10.3',
                        port: 13002,
                        egressIp: '203.0.113.23',
                        maxConnections: 50,
                        maxConcurrent: 20,
                        requestsPerMinute: 300,
                        weight: 1,
                        desiredState: 'disabled',
                    },
                ],
            },
        ],
        workerCidrs: ['172.29.10.0/28'],
        allowedDestinationPorts: [2525, 587],
    }
}

function credentialsByNode(): Map<string, Record<string, { user: string; pass: string }>> {
    return new Map<string, Record<string, { user: string; pass: string }>>([
        ['proxy-node-a', { 'egress-a': { user: 'egress-a', pass: 'secret-a' } }],
        [
            'proxy-node-b',
            {
                'egress-b': { user: 'egress-b', pass: 'secret-b' },
                'egress-c': { user: 'egress-c', pass: 'secret-c' },
            },
        ],
    ])
}

describe('renderStack', () => {
    it('renders exactly one service per declared node, each constrained to that node', () => {
        const { yaml } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const stack = parse(yaml) as Record<string, unknown>
        const services = stack.services as Record<string, Record<string, unknown>>

        expect(Object.keys(services).sort()).toEqual(['proxy-node-a', 'proxy-node-b'])

        const deployA = services['proxy-node-a'].deploy as Record<string, unknown>
        expect(deployA.replicas).toBe(1)
        expect((deployA.placement as { constraints: string[] }).constraints).toEqual([
            'node.labels.proxy.egress == true',
            'node.labels.proxy.node-id == proxy-node-a',
        ])
    })

    it('references only that node\'s own config and credential secret', () => {
        const { yaml } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const stack = parse(yaml) as Record<string, unknown>
        const services = stack.services as Record<string, Record<string, unknown>>

        const configsA = services['proxy-node-a'].configs as { source: string }[]
        const secretsA = services['proxy-node-a'].secrets as { source: string }[]
        expect(configsA).toEqual([{ source: 'proxy-node-a-listeners', target: CONTAINER_MANIFEST_PATH, mode: 0o444 }])
        expect(secretsA).toEqual([{ source: 'proxy-node-a-credentials', target: CONTAINER_CREDENTIALS_PATH, mode: 0o400 }])
    })

    it('uses the pinned digest, host networking, and publishes no ingress ports', () => {
        const { yaml } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const stack = parse(yaml) as Record<string, unknown>
        const services = stack.services as Record<string, Record<string, unknown>>

        for (const service of Object.values(services)) {
            expect(service.image).toBe(DIGEST)
            expect(service.networks).toEqual({ hostnet: null })
            expect(service.ports).toBeUndefined()
        }

        expect(stack.networks).toEqual({ hostnet: { external: true, name: 'host' } })
    })

    it('never uses build and labels every service/config/secret as owned', () => {
        const { yaml } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        expect(yaml).not.toMatch(/\bbuild:/)

        const stack = parse(yaml) as Record<string, unknown>
        const services = stack.services as Record<string, Record<string, unknown>>
        const configs = stack.configs as Record<string, Record<string, unknown>>
        const secrets = stack.secrets as Record<string, Record<string, unknown>>

        for (const service of Object.values(services)) {
            expect((service.deploy as { labels: Record<string, string> }).labels[OWNER_LABEL]).toBe('true')
        }
        for (const config of Object.values(configs)) {
            expect((config.labels as Record<string, string>)[OWNER_LABEL]).toBe('true')
        }
        for (const secret of Object.values(secrets)) {
            expect((secret.labels as Record<string, string>)[OWNER_LABEL]).toBe('true')
        }
    })

    it('renders a non-secret manifest with only the plan-11 fields, for every listener on the node', () => {
        const { nodeArtifacts } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const nodeB = nodeArtifacts.find(artifact => artifact.node.proxyNodeId === 'proxy-node-b')!
        const manifest = JSON.parse(nodeB.manifestJson) as { listeners: unknown[] }

        expect(manifest).toMatchObject({
            workerCidrs: ['172.29.10.0/28'],
            allowedDestinationPorts: [2525, 587],
        })
        expect(manifest.listeners).toEqual([
            { egressId: 'egress-b', bindIp: '172.29.10.3', port: 13001, egressIp: '203.0.113.22', maxConnections: 50 },
            { egressId: 'egress-c', bindIp: '172.29.10.3', port: 13002, egressIp: '203.0.113.23', maxConnections: 50 },
        ])
        expect(nodeB.manifestJson).not.toMatch(/secret-/)
    })

    it('renders the credential file scoped to only that node\'s listeners', () => {
        const { nodeArtifacts } = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const nodeA = nodeArtifacts.find(artifact => artifact.node.proxyNodeId === 'proxy-node-a')!

        expect(JSON.parse(nodeA.credentialsJson)).toEqual({ 'egress-a': { user: 'egress-a', pass: 'secret-a' } })
    })

    it('is deterministic: rendering the same input twice produces byte-identical output', () => {
        const first = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })
        const second = renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentialsByNode() })

        expect(first.yaml).toEqual(second.yaml)
    })

    it('rejects an image reference that is not pinned by digest', () => {
        expect(() =>
            renderStack(inventory(), { imageDigest: 'ghcr.io/tuposoft/lef-3proxy:latest', credentialsByNode: credentialsByNode() }),
        ).toThrow(StackRenderError)
    })

    it('rejects a node with no staged credentials', () => {
        const credentials = credentialsByNode()
        credentials.delete('proxy-node-b')

        expect(() => renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentials })).toThrow(
            /missing staged credentials for node\(s\): proxy-node-b/,
        )
    })

    it('rejects staged credentials that do not match a node\'s listener egressIds 1:1', () => {
        const credentials = credentialsByNode()
        credentials.set('proxy-node-a', { 'egress-a': { user: 'egress-a', pass: 'secret-a' }, 'egress-x': { user: 'x', pass: 'y' } })

        expect(() => renderStack(inventory(), { imageDigest: DIGEST, credentialsByNode: credentials })).toThrow(
            /do not match its listener egressId set 1:1/,
        )
    })
})
