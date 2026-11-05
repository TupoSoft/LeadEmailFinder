import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseFleetInventory } from './inventory'
import { verifyListenerEgress } from './listener-health-check'
import { readApiKeyFile } from './api-key-file'
import { HttpProxyRegistryAdmin } from './proxy-registry-admin'
import { desiredListenersFrom, reconcile } from './reconcile'

const run = promisify(execFile)

/**
 * Reconciles the live proxy registry against the plan-12 Ansible inventory: creates missing listeners
 * disabled, health-gates activation, syncs weight/capacity, and drains listeners removed from
 * inventory. Never deletes a registry record and never logs credentials -- `ReconcileAction` carries
 * only ids and egressIds. See `deploy/proxy-fleet/swarm/README.md`.
 */
async function main(): Promise<void> {
    const ansibleInventoryPath = requireEnv('PROXY_FLEET_ANSIBLE_INVENTORY')
    const credentialsDir = requireEnv('PROXY_FLEET_CREDENTIALS_DIR')
    const apiBaseUrl = requireEnv('PROXY_FLEET_API_BASE_URL')
    const apiKeyFile = requireEnv('PROXY_FLEET_API_KEY_FILE')
    const probeHost = requireEnv('PROXY_FLEET_SMTP_PROBE_HOST')
    const probePort = Number(process.env.PROXY_FLEET_SMTP_PROBE_PORT ?? 2525)
    const probeStatusUrl = requireEnv('PROXY_FLEET_SMTP_PROBE_STATUS_URL')

    const { stdout } = await run('ansible-inventory', ['-i', ansibleInventoryPath, '--list'], {
        maxBuffer: 32 * 1024 * 1024,
    })
    const inventory = parseFleetInventory(JSON.parse(stdout))

    const credentialsByNode = new Map<string, Record<string, { user: string; pass: string }>>()
    for (const node of inventory.nodes) {
        const raw = await readFile(join(credentialsDir, `${node.proxyNodeId}.json`), 'utf8')
        credentialsByNode.set(node.proxyNodeId, JSON.parse(raw) as Record<string, { user: string; pass: string }>)
    }

    const desired = desiredListenersFrom(inventory, credentialsByNode)
    const registry = new HttpProxyRegistryAdmin({
        baseUrl: apiBaseUrl,
        getBearerToken: () => readApiKeyFile(apiKeyFile),
    })

    const summary = await reconcile(desired, {
        registry,
        healthCheck: verifyListenerEgress,
        probe: { host: probeHost, port: probePort, statusUrl: probeStatusUrl },
    })

    for (const action of summary.actions) {
        console.log(JSON.stringify(action))
    }
    console.log(`Reconciled ${desired.length} desired listener(s); ${summary.actions.length} action(s) taken.`)
}

function requireEnv(name: string): string {
    const value = process.env[name]
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} is required`)
    }
    return value
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
