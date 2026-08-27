import { stringify } from 'yaml'
import type { FleetInventory, ProxyFleetNode } from './inventory'

/** Owned label applied to every Swarm service/config/secret this renderer produces. Used to scope pruning. */
export const OWNER_LABEL = 'proxy-fleet.owner'

export const CONTAINER_MANIFEST_PATH = '/etc/lead-email-finder/proxy-fleet/listeners.json'
export const CONTAINER_CREDENTIALS_PATH = '/run/secrets/proxy_credentials'

export interface NodeCredentials {
    readonly [egressId: string]: { readonly user: string; readonly pass: string }
}

export interface StackRenderOptions {
    readonly imageDigest: string
    /** proxy_node_id -> that node's plan-12-staged credentials.json content. */
    readonly credentialsByNode: ReadonlyMap<string, NodeCredentials>
    readonly healthcheck?: {
        readonly intervalSeconds?: number
        readonly timeoutSeconds?: number
        readonly retries?: number
        readonly startPeriodSeconds?: number
    }
}

export interface RenderedNodeArtifact {
    readonly node: ProxyFleetNode
    readonly serviceName: string
    readonly configName: string
    readonly secretName: string
    /** Plan-11-shaped, non-secret listener manifest for this node. Safe to print/record. */
    readonly manifestJson: string
    /** Plan-11-shaped credential file for this node. Never print or log this. */
    readonly credentialsJson: string
}

export interface RenderedStack {
    readonly yaml: string
    readonly nodeArtifacts: readonly RenderedNodeArtifact[]
}

export class StackRenderError extends Error {}

export function renderStack(inventory: FleetInventory, options: StackRenderOptions): RenderedStack {
    validateImageDigest(options.imageDigest)

    const missingCredentials = inventory.nodes
        .map(node => node.proxyNodeId)
        .filter(proxyNodeId => !options.credentialsByNode.has(proxyNodeId))

    if (missingCredentials.length > 0) {
        throw new StackRenderError(`missing staged credentials for node(s): ${missingCredentials.join(', ')}`)
    }

    const nodeArtifacts = inventory.nodes.map(node =>
        renderNodeArtifact(node, inventory, options.credentialsByNode.get(node.proxyNodeId)!),
    )

    const hc = options.healthcheck ?? {}
    const interval = hc.intervalSeconds ?? 10
    const timeout = hc.timeoutSeconds ?? 5
    const retries = hc.retries ?? 5
    const startPeriod = hc.startPeriodSeconds ?? 10

    const services: Record<string, unknown> = {}
    const configs: Record<string, unknown> = {}
    const secrets: Record<string, unknown> = {}

    for (const artifact of nodeArtifacts) {
        configs[artifact.configName] = {
            file: `./generated/${artifact.node.proxyNodeId}/listeners.json`,
            labels: { [OWNER_LABEL]: 'true' },
        }
        secrets[artifact.secretName] = {
            file: `./generated/${artifact.node.proxyNodeId}/credentials.json`,
            labels: { [OWNER_LABEL]: 'true' },
        }

        services[artifact.serviceName] = {
            image: options.imageDigest,
            networks: { hostnet: null },
            configs: [{ source: artifact.configName, target: CONTAINER_MANIFEST_PATH, mode: 0o444 }],
            secrets: [{ source: artifact.secretName, target: CONTAINER_CREDENTIALS_PATH, mode: 0o400 }],
            healthcheck: {
                test: ['CMD', '/usr/local/bin/healthcheck.sh'],
                interval: `${interval}s`,
                timeout: `${timeout}s`,
                retries,
                start_period: `${startPeriod}s`,
            },
            deploy: {
                replicas: 1,
                labels: { [OWNER_LABEL]: 'true' },
                placement: {
                    constraints: ['node.labels.proxy.egress == true', `node.labels.proxy.node-id == ${artifact.node.proxyNodeId}`],
                },
            },
        }
    }

    const stack = {
        version: '3.8',
        services,
        networks: { hostnet: { external: true, name: 'host' } },
        configs,
        secrets,
    }

    return {
        yaml: `${stringify(stack, { lineWidth: 0 })}`,
        nodeArtifacts,
    }
}

function renderNodeArtifact(
    node: ProxyFleetNode,
    inventory: FleetInventory,
    credentials: NodeCredentials,
): RenderedNodeArtifact {
    const listenerCredentialIds = Object.keys(credentials).sort()
    const nodeListenerIds = [...node.listeners.map(listener => listener.egressId)].sort()

    if (JSON.stringify(listenerCredentialIds) !== JSON.stringify(nodeListenerIds)) {
        throw new StackRenderError(
            `staged credentials for node ${node.proxyNodeId} do not match its listener egressId set 1:1 ` +
                `(listeners: ${nodeListenerIds.join(', ')}, credentials: ${listenerCredentialIds.join(', ')})`,
        )
    }

    const manifest = {
        workerCidrs: inventory.workerCidrs,
        allowedDestinationPorts: inventory.allowedDestinationPorts,
        listeners: node.listeners.map(listener => ({
            egressId: listener.egressId,
            bindIp: listener.bindIp,
            port: listener.port,
            egressIp: listener.egressIp,
            maxConnections: listener.maxConnections,
        })),
    }

    const nodeCredentials = Object.fromEntries(node.listeners.map(listener => [listener.egressId, credentials[listener.egressId]]))

    return {
        node,
        serviceName: node.proxyNodeId,
        configName: `${node.proxyNodeId}-listeners`,
        secretName: `${node.proxyNodeId}-credentials`,
        manifestJson: JSON.stringify(manifest, null, 2),
        credentialsJson: JSON.stringify(nodeCredentials, null, 2),
    }
}

function validateImageDigest(imageDigest: string): void {
    if (!/@sha256:[a-f0-9]{64}$/.test(imageDigest)) {
        throw new StackRenderError(
            `imageDigest must reference an immutable digest (e.g. registry/image@sha256:<64 hex chars>), got: ${imageDigest}`,
        )
    }
}
