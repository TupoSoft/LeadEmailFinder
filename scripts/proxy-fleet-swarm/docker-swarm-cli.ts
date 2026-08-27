import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { OWNER_LABEL } from './stack-renderer'

export type CommandRunner = (command: string, args: string[]) => Promise<string>

const defaultRunner: CommandRunner = async (command, args) => {
    const { stdout } = await promisify(execFile)(command, args, { maxBuffer: 32 * 1024 * 1024 })
    return stdout
}

export class DockerSwarmDeployError extends Error {}

/**
 * Everything the deployment wrapper needs from the Docker CLI. `docker stack deploy` already handles
 * content-hashed, immutable config/secret versioning on its own (see the `file:`-referenced `configs:`
 * and `secrets:` entries the stack renderer emits), so this port only needs to trigger and observe that
 * behavior, not reimplement it.
 */
export interface DockerSwarmPort {
    /** Validates the rendered stack file without mutating anything (`docker stack config`). */
    validateStack(stackFilePath: string): Promise<void>
    /** Deploys the stack. Mutating: creates/updates services and any new content-hashed config/secret. */
    deployStack(stackFilePath: string, stackName: string): Promise<void>
    /** Waits until every declared service reports its desired replica count running. */
    waitForConvergence(stackName: string, expectedServiceCount: number, timeoutMs: number): Promise<void>
    /** Removes only unreferenced configs/secrets carrying the proxy-fleet ownership label. */
    pruneUnreferenced(): Promise<void>
}

interface ServiceReplicas {
    name: string
    replicas: string
}

export class DockerCliSwarmApi implements DockerSwarmPort {
    constructor(private readonly runCommand: CommandRunner = defaultRunner) {}

    async validateStack(stackFilePath: string): Promise<void> {
        await this.docker(['stack', 'config', '-c', stackFilePath])
    }

    async deployStack(stackFilePath: string, stackName: string): Promise<void> {
        await this.docker(['stack', 'deploy', '-c', stackFilePath, '--with-registry-auth', stackName])
    }

    async waitForConvergence(stackName: string, expectedServiceCount: number, timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs

        for (;;) {
            const services = await this.listServiceReplicas(stackName)
            const converged = services.length === expectedServiceCount && services.every(isConverged)

            if (converged) {
                return
            }

            if (Date.now() >= deadline) {
                throw new DockerSwarmDeployError(
                    `stack ${stackName} did not converge within ${timeoutMs}ms: ${services.map(s => `${s.name}=${s.replicas}`).join(', ')}`,
                )
            }

            await new Promise(resolve => setTimeout(resolve, 2_000))
        }
    }

    async pruneUnreferenced(): Promise<void> {
        await this.docker(['config', 'prune', '-f', '--filter', `label=${OWNER_LABEL}=true`])
        await this.docker(['secret', 'prune', '-f', '--filter', `label=${OWNER_LABEL}=true`])
    }

    private async listServiceReplicas(stackName: string): Promise<ServiceReplicas[]> {
        const stdout = await this.docker(['stack', 'services', stackName, '--format', '{{.Name}}\t{{.Replicas}}'])

        return stdout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const [name, replicas] = line.split('\t')
                return { name, replicas }
            })
    }

    private async docker(args: string[]): Promise<string> {
        try {
            return await this.runCommand('docker', args)
        } catch (error: unknown) {
            const stderr = typeof error === 'object' && error && 'stderr' in error ? String(error.stderr) : ''
            throw new DockerSwarmDeployError(`docker ${args.join(' ')} failed: ${stderr.trim() || String(error)}`)
        }
    }
}

function isConverged(service: ServiceReplicas): boolean {
    const match = /^(\d+)\/(\d+)$/.exec(service.replicas)
    return match !== null && match[1] === match[2] && match[1] !== '0'
}
