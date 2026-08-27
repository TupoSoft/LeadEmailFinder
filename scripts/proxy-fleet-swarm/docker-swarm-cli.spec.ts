import { DockerCliSwarmApi, DockerSwarmDeployError } from './docker-swarm-cli'
import { OWNER_LABEL } from './stack-renderer'

function fakeRunner(handler: (command: string, args: string[]) => Promise<string> | string): jest.Mock {
    return jest.fn(async (command: string, args: string[]) => handler(command, args))
}

describe('DockerCliSwarmApi', () => {
    it('validates a stack via docker stack config', async () => {
        const runner = fakeRunner(() => 'ok')
        await new DockerCliSwarmApi(runner).validateStack('/tmp/stack.generated.yml')

        expect(runner).toHaveBeenCalledWith('docker', ['stack', 'config', '-c', '/tmp/stack.generated.yml'])
    })

    it('surfaces stack config failures before any mutation', async () => {
        const runner = fakeRunner(() => {
            const error: Error & { stderr?: string } = new Error('exit 1')
            error.stderr = 'unsupported option "build"'
            throw error
        })

        await expect(new DockerCliSwarmApi(runner).validateStack('/tmp/stack.generated.yml')).rejects.toThrow(
            /unsupported option "build"/,
        )
    })

    it('deploys the stack with registry auth', async () => {
        const runner = fakeRunner(() => '')
        await new DockerCliSwarmApi(runner).deployStack('/tmp/stack.generated.yml', 'proxy-fleet')

        expect(runner).toHaveBeenCalledWith('docker', [
            'stack',
            'deploy',
            '-c',
            '/tmp/stack.generated.yml',
            '--with-registry-auth',
            'proxy-fleet',
        ])
    })

    it('waits for convergence and returns once every service reports full replicas', async () => {
        let call = 0
        const runner = fakeRunner(() => {
            call += 1
            return call === 1 ? 'proxy-node-a\t0/1\nproxy-node-b\t1/1\n' : 'proxy-node-a\t1/1\nproxy-node-b\t1/1\n'
        })

        await new DockerCliSwarmApi(runner).waitForConvergence('proxy-fleet', 2, 10_000)

        expect(call).toBe(2)
    })

    it('throws when convergence does not happen before the timeout', async () => {
        jest.useFakeTimers()
        try {
            const runner = fakeRunner(() => 'proxy-node-a\t0/1\n')
            const assertion = expect(new DockerCliSwarmApi(runner).waitForConvergence('proxy-fleet', 1, 1)).rejects.toThrow(
                DockerSwarmDeployError,
            )
            await jest.runAllTimersAsync()
            await assertion
        } finally {
            jest.useRealTimers()
        }
    })

    it('throws when the expected service count is not yet reflected', async () => {
        jest.useFakeTimers()
        try {
            const runner = fakeRunner(() => 'proxy-node-a\t1/1\n')
            const assertion = expect(new DockerCliSwarmApi(runner).waitForConvergence('proxy-fleet', 2, 1)).rejects.toThrow(
                DockerSwarmDeployError,
            )
            await jest.runAllTimersAsync()
            await assertion
        } finally {
            jest.useRealTimers()
        }
    })

    it('prunes only unreferenced, ownership-labelled configs and secrets', async () => {
        const runner = fakeRunner(() => '')
        await new DockerCliSwarmApi(runner).pruneUnreferenced()

        expect(runner).toHaveBeenNthCalledWith(1, 'docker', ['config', 'prune', '-f', '--filter', `label=${OWNER_LABEL}=true`])
        expect(runner).toHaveBeenNthCalledWith(2, 'docker', ['secret', 'prune', '-f', '--filter', `label=${OWNER_LABEL}=true`])
    })
})
