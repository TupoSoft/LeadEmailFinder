import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { DockerCliSwarmApi } from './docker-swarm-cli'

/**
 * Deploys the stack rendered by `render-stack-cli.ts`, waits for every declared service to converge,
 * then prunes unreferenced ownership-labelled configs/secrets. `docker stack deploy` itself creates any
 * new content-hashed config/secret object; this wrapper never calls `docker config create`/`docker
 * secret create` directly. See `deploy/proxy-fleet/swarm/README.md`.
 */
async function main(): Promise<void> {
    const stackPath = process.env.PROXY_FLEET_STACK_FILE ?? 'deploy/proxy-fleet/swarm/stack.generated.yml'
    const stackName = process.env.PROXY_FLEET_STACK_NAME ?? 'proxy-fleet'
    const convergenceTimeoutMs = Number(process.env.PROXY_FLEET_CONVERGENCE_TIMEOUT_MS ?? 120_000)

    const stack = parse(await readFile(stackPath, 'utf8')) as { services?: Record<string, unknown> }
    const expectedServiceCount = Object.keys(stack.services ?? {}).length

    if (expectedServiceCount === 0) {
        throw new Error(`${stackPath} declares no services`)
    }

    const docker = new DockerCliSwarmApi()

    await docker.validateStack(stackPath)
    await docker.deployStack(stackPath, stackName)
    await docker.waitForConvergence(stackName, expectedServiceCount, convergenceTimeoutMs)
    await docker.pruneUnreferenced()

    console.log(`Deployed and converged stack "${stackName}" with ${expectedServiceCount} service(s).`)
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
