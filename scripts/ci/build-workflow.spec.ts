import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { parseDocument } from 'yaml'

interface Step {
    id?: string
    run?: string
    uses?: string
    with?: Record<string, unknown>
}

interface BuildWorkflow {
    on: Record<string, unknown>
    jobs: {
        'build-push': {
            'runs-on': string
            'timeout-minutes': number
            permissions: Record<string, string>
            steps: Step[]
        }
    }
}

const source = readFileSync(resolve(__dirname, '../../.github/workflows/build.yml'), 'utf8')
const document = parseDocument(source, { uniqueKeys: true })
const workflow = document.toJS() as BuildWorkflow
const job = workflow.jobs['build-push']

describe('manual container build workflow', () => {
    it('runs only on explicit dispatch with the ARC runner and package publishing permission', () => {
        expect(document.errors).toEqual([])
        expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
        expect(job['runs-on']).toBe('tuposoft-pc-wsl')
        expect(job['timeout-minutes']).toBe(15)
        expect(job.permissions).toEqual({ packages: 'write', contents: 'read' })
    })

    it('authenticates to GHCR and prepares Buildx before publishing the Dockerfile with shared caching', () => {
        const loginIndex = job.steps.findIndex((step) => step.uses?.startsWith('docker/login-action@'))
        const setupIndex = job.steps.findIndex((step) => step.uses?.startsWith('docker/setup-buildx-action@'))
        const buildIndex = job.steps.findIndex((step) => step.uses?.startsWith('docker/build-push-action@'))
        expect(loginIndex).toBeGreaterThanOrEqual(0)
        expect(setupIndex).toBeGreaterThanOrEqual(0)
        expect(buildIndex).toBeGreaterThan(loginIndex)
        expect(buildIndex).toBeGreaterThan(setupIndex)
        expect(job.steps[loginIndex].with).toMatchObject({
            registry: 'https://ghcr.io',
            username: '${{ github.actor }}',
            password: '${{ secrets.GITHUB_TOKEN }}',
        })
        expect(job.steps[setupIndex].with).toMatchObject({ platforms: 'linux/amd64' })
        expect(job.steps[buildIndex].with).toMatchObject({
            push: true,
            tags: '${{ steps.prepare_tags.outputs.tags }}',
            file: 'Dockerfile',
            'cache-from': 'type=gha',
            'cache-to': 'type=gha,mode=max',
        })
    })

    it.each([
        ['master', 'ghcr.io/tuposoft/leademailfinder:abc123,ghcr.io/tuposoft/leademailfinder:latest'],
        ['kk/arc-runners', 'ghcr.io/tuposoft/leademailfinder:abc123'],
    ])('publishes the commit tag and adds latest only for master (%s)', (branch, expectedTags) => {
        const prepareIndex = job.steps.findIndex((step) => step.id === 'prepare_tags')
        const buildIndex = job.steps.findIndex((step) => step.uses?.startsWith('docker/build-push-action@'))
        expect(prepareIndex).toBeGreaterThanOrEqual(0)
        expect(prepareIndex).toBeLessThan(buildIndex)
        const script = job.steps[prepareIndex].run
        expect(typeof script).toBe('string')

        const directory = mkdtempSync(join(tmpdir(), 'lef-build-tags-'))
        try {
            const output = join(directory, 'github-output')
            const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script!], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    GITHUB_REPOSITORY: 'TupoSoft/LeadEmailFinder',
                    GITHUB_SHA: 'abc123',
                    GITHUB_REF_NAME: branch,
                    GITHUB_OUTPUT: output,
                },
            })
            expect(execution.error).toBeUndefined()
            expect(execution.stderr).toBe('')
            expect(execution.status).toBe(0)
            expect(readFileSync(output, 'utf8').trim()).toBe(`tags=${expectedTags}`)
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })
})
