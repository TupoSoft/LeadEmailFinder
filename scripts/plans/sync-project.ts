import { resolve } from 'node:path'
import { discoverExecPlans } from './execplan'
import { GitHubCliProjectApi } from './github-project-api'
import { ExecPlanSynchronizer } from './sync'

const DEFAULT_PLANS_DIR = '.agents/plans'
const DEFAULT_REPOSITORY = 'TupoSoft/LeadEmailFinder'
const DEFAULT_PROJECT_OWNER = 'TupoSoft'
const DEFAULT_PROJECT_NUMBER = '9'
const DEFAULT_BRANCH = 'master'

async function main(): Promise<void> {
    const dryRun = process.env.PLANS_DRY_RUN === 'true'

    if (!dryRun && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
        throw new Error(
            'No GitHub token available. In CI, set the PROJECT_SYNC_TOKEN secret as GH_TOKEN; the default ' +
                'Actions token cannot write organization projects. Locally, authenticate with `gh auth login`.',
        )
    }

    const repositoryRoot = resolve(__dirname, '..', '..')
    const plansRoot = resolve(repositoryRoot, process.env.PLANS_DIR ?? DEFAULT_PLANS_DIR)
    const repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY
    const branch = process.env.PLANS_BRANCH ?? DEFAULT_BRANCH

    const plans = await discoverExecPlans(plansRoot, repositoryRoot)

    if (plans.length === 0) {
        throw new Error(`No ExecPlans found under ${plansRoot}`)
    }

    const synchronizer = new ExecPlanSynchronizer(
        new GitHubCliProjectApi({
            repository,
            projectOwner: process.env.PLANS_PROJECT_OWNER ?? DEFAULT_PROJECT_OWNER,
            projectNumber: process.env.PLANS_PROJECT_NUMBER ?? DEFAULT_PROJECT_NUMBER,
        }),
        { blobBaseUrl: `https://github.com/${repository}/blob/${branch}`, dryRun },
    )

    const outcomes = await synchronizer.sync(plans)

    for (const outcome of outcomes) {
        const issue = outcome.issueNumber ? `#${outcome.issueNumber}` : '(new)'
        const status = outcome.statusApplied ? `status -> ${outcome.status}` : `status ${outcome.status}`
        const project = outcome.addedToProject ? ', added to project' : ''
        console.log(`${dryRun ? '[dry-run] ' : ''}${outcome.key} ${issue}: ${outcome.issueAction}, ${status}${project}`)
    }

    const created = outcomes.filter(outcome => outcome.issueAction === 'created').length
    const updated = outcomes.filter(outcome => outcome.issueAction === 'updated').length
    console.log(`${plans.length} ExecPlans synced: ${created} created, ${updated} updated.`)
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
