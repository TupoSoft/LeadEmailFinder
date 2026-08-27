import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { DockerCliSwarmApi } from './docker-swarm-cli'
import { parseFleetInventory } from './inventory'
import { renderStack, type NodeCredentials } from './stack-renderer'

const run = promisify(execFile)

/**
 * Renders `stack.generated.yml` and every node's non-secret manifest/credential file from the plan-12
 * Ansible inventory, then validates it with `docker stack config` -- no mutation. See
 * `deploy/proxy-fleet/swarm/README.md` for the full workflow this is one step of.
 */
async function main(): Promise<void> {
    const ansibleInventoryPath = requireEnv('PROXY_FLEET_ANSIBLE_INVENTORY')
    const imageDigest = requireEnv('PROXY_FLEET_IMAGE_DIGEST')
    const credentialsDir = requireEnv('PROXY_FLEET_CREDENTIALS_DIR')
    const outputDir = process.env.PROXY_FLEET_OUTPUT_DIR ?? join('deploy', 'proxy-fleet', 'swarm', 'generated')

    const { stdout } = await run('ansible-inventory', ['-i', ansibleInventoryPath, '--list'], { maxBuffer: 32 * 1024 * 1024 })
    const inventory = parseFleetInventory(JSON.parse(stdout))

    const credentialsByNode = new Map<string, NodeCredentials>()
    for (const node of inventory.nodes) {
        const raw = await readFile(join(credentialsDir, `${node.proxyNodeId}.json`), 'utf8')
        credentialsByNode.set(node.proxyNodeId, JSON.parse(raw) as NodeCredentials)
    }

    const { yaml, nodeArtifacts } = renderStack(inventory, { imageDigest, credentialsByNode })

    await mkdir(outputDir, { recursive: true })
    const stackPath = join(outputDir, '..', 'stack.generated.yml')
    await writeFile(stackPath, yaml)

    for (const artifact of nodeArtifacts) {
        const nodeDir = join(outputDir, artifact.node.proxyNodeId)
        await mkdir(nodeDir, { recursive: true })
        await writeFile(join(nodeDir, 'listeners.json'), artifact.manifestJson)
        await writeFile(join(nodeDir, 'credentials.json'), artifact.credentialsJson, { mode: 0o600 })
    }

    await new DockerCliSwarmApi().validateStack(stackPath)

    console.log(`Rendered and validated ${stackPath} with ${nodeArtifacts.length} node service(s).`)
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
