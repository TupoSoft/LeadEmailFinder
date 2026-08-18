import { ExecPlan, parseExecPlan, ProjectStatus, renderIssueBody, resolvePlanStates } from './execplan'
import { GitHubProjectPort, IssueContent, IssueSummary, ProjectItemSummary } from './github-project-api'
import { ExecPlanSynchronizer } from './sync'

const BLOB_BASE_URL = 'https://github.com/TupoSoft/LeadEmailFinder/blob/master'

function buildPlan(path = '.agents/plans/payments/01-idempotent-credit-grants.md', progress = '- [ ] Work.'): ExecPlan {
    return parseExecPlan(
        path,
        [
            '# Grant credits idempotently',
            '',
            '## Purpose / Big Picture',
            '',
            'Make adding credits as safe as spending them.',
            '',
            '## Progress',
            '',
            progress,
            '',
            '## Plan dependencies',
            '',
            'None.',
            '',
            '## Plan readiness',
            '',
            'Ready to implement.',
            '',
        ].join('\n'),
    )
}

class FakeGitHub implements GitHubProjectPort {
    readonly created: IssueContent[] = []
    readonly updated: { issueNumber: number; content: IssueContent }[] = []
    readonly statuses: { itemId: string; status: ProjectStatus }[] = []
    readonly addedUrls: string[] = []
    readonly validatedStatuses: ProjectStatus[][] = []
    ensureLabelsCalls = 0

    constructor(
        private readonly issues: IssueSummary[] = [],
        private readonly items: ProjectItemSummary[] = [],
    ) {}

    validateStatusOptions(statuses: readonly ProjectStatus[]): Promise<void> {
        this.validatedStatuses.push([...statuses])
        return Promise.resolve()
    }

    ensureLabels(): Promise<void> {
        this.ensureLabelsCalls += 1
        return Promise.resolve()
    }

    listExecPlanIssues(): Promise<IssueSummary[]> {
        return Promise.resolve([...this.issues])
    }

    createIssue(content: IssueContent): Promise<IssueSummary> {
        this.created.push(content)
        const issue = {
            number: 100 + this.created.length,
            url: `https://github.com/TupoSoft/LeadEmailFinder/issues/${100 + this.created.length}`,
            title: content.title,
            body: content.body,
        }
        this.issues.push(issue)
        return Promise.resolve(issue)
    }

    updateIssue(issueNumber: number, content: IssueContent): Promise<void> {
        this.updated.push({ issueNumber, content })
        return Promise.resolve()
    }

    listProjectItems(): Promise<ProjectItemSummary[]> {
        return Promise.resolve([...this.items])
    }

    addIssueToProject(issueUrl: string): Promise<string> {
        this.addedUrls.push(issueUrl)
        return Promise.resolve(`item-${this.addedUrls.length}`)
    }

    setItemStatus(itemId: string, status: ProjectStatus): Promise<void> {
        this.statuses.push({ itemId, status })
        return Promise.resolve()
    }
}

function existingIssue(plan: ExecPlan, overrides: Partial<IssueSummary> = {}): IssueSummary {
    const state = resolvePlanStates([plan]).get(plan.key)

    if (!state) {
        throw new Error(`No state for ${plan.key}`)
    }

    return {
        number: 42,
        url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/42',
        title: plan.title,
        body: renderIssueBody(plan, state, BLOB_BASE_URL),
        ...overrides,
    }
}

function synchronizer(github: GitHubProjectPort, dryRun = false): ExecPlanSynchronizer {
    return new ExecPlanSynchronizer(github, { blobBaseUrl: BLOB_BASE_URL, dryRun })
}

describe('ExecPlanSynchronizer', (): void => {
    it('creates a missing issue, adds it to the project, and sets its status', async (): Promise<void> => {
        const github = new FakeGitHub()

        const [outcome] = await synchronizer(github).sync([buildPlan()])

        expect(outcome).toMatchObject({ key: 'payments/01', issueAction: 'created', status: 'Todo' })
        expect(github.created).toHaveLength(1)
        expect(github.created[0].labels).toEqual(['execplan'])
        expect(github.validatedStatuses).toEqual([['Backlog', 'Todo', 'In Progress', 'Done']])
        expect(github.addedUrls).toHaveLength(1)
        expect(github.statuses).toEqual([{ itemId: 'item-1', status: 'Todo' }])
    })

    it('reports an unchanged plan and writes nothing', async (): Promise<void> => {
        const plan = buildPlan()
        const issue = existingIssue(plan)
        const github = new FakeGitHub([issue], [{ id: 'item-9', contentUrl: issue.url, status: 'Todo' }])

        const [outcome] = await synchronizer(github).sync([plan])

        expect(outcome).toMatchObject({ issueNumber: 42, issueAction: 'unchanged', statusApplied: false })
        expect(github.created).toHaveLength(0)
        expect(github.updated).toHaveLength(0)
        expect(github.statuses).toHaveLength(0)
    })

    it('matches a renamed plan file by marker and updates the existing issue', async (): Promise<void> => {
        const plan = buildPlan()
        const issue = existingIssue(plan)
        const renamed = buildPlan('.agents/plans/payments/01-completely-different-slug.md')
        const github = new FakeGitHub([issue], [{ id: 'item-9', contentUrl: issue.url, status: 'Todo' }])

        const [outcome] = await synchronizer(github).sync([renamed])

        expect(outcome).toMatchObject({ issueNumber: 42, issueAction: 'updated' })
        expect(github.created).toHaveLength(0)
        expect(github.updated).toHaveLength(1)
        expect(github.updated[0].content.body).toContain('01-completely-different-slug.md')
    })

    it('advances status when checkboxes progress', async (): Promise<void> => {
        const plan = buildPlan('.agents/plans/payments/01-a.md', '- [x] One.\n- [ ] Two.')
        const issue = existingIssue(plan)
        const github = new FakeGitHub([issue], [{ id: 'item-9', contentUrl: issue.url, status: 'Todo' }])

        const [outcome] = await synchronizer(github).sync([plan])

        expect(outcome).toMatchObject({ status: 'In Progress', statusApplied: true })
        expect(github.statuses).toEqual([{ itemId: 'item-9', status: 'In Progress' }])
    })

    it('never moves an item out of Done', async (): Promise<void> => {
        const plan = buildPlan('.agents/plans/payments/01-a.md', '- [ ] Reopened by a later edit.')
        const issue = existingIssue(plan)
        const github = new FakeGitHub([issue], [{ id: 'item-9', contentUrl: issue.url, status: 'Done' }])

        const [outcome] = await synchronizer(github).sync([plan])

        expect(outcome.statusApplied).toBe(false)
        expect(github.statuses).toHaveLength(0)
    })

    it('adds an existing issue that is missing from the project', async (): Promise<void> => {
        const plan = buildPlan()
        const github = new FakeGitHub([existingIssue(plan)], [])

        const [outcome] = await synchronizer(github).sync([plan])

        expect(outcome.addedToProject).toBe(true)
        expect(github.addedUrls).toEqual(['https://github.com/TupoSoft/LeadEmailFinder/issues/42'])
        expect(github.statuses).toEqual([{ itemId: 'item-1', status: 'Todo' }])
    })

    it('writes nothing in dry-run mode but still reports the actions', async (): Promise<void> => {
        const plan = buildPlan()
        const github = new FakeGitHub()

        const [outcome] = await synchronizer(github, true).sync([plan])

        expect(outcome).toMatchObject({ issueAction: 'created', statusApplied: false })
        expect(github.ensureLabelsCalls).toBe(0)
        expect(github.created).toHaveLength(0)
        expect(github.addedUrls).toHaveLength(0)
        expect(github.statuses).toHaveLength(0)
        expect(github.validatedStatuses).toHaveLength(1)
    })

    it('aborts before labels or issues when project status preflight fails', async (): Promise<void> => {
        const github = new FakeGitHub()
        github.validateStatusOptions = (): Promise<void> => Promise.reject(new Error('Status is missing: Backlog'))

        await expect(synchronizer(github).sync([buildPlan()])).rejects.toThrow('Status is missing: Backlog')

        expect(github.ensureLabelsCalls).toBe(0)
        expect(github.created).toHaveLength(0)
        expect(github.updated).toHaveLength(0)
    })

    it('keeps plans independent so one new issue does not disturb another', async (): Promise<void> => {
        const first = buildPlan('.agents/plans/payments/01-a.md')
        const second = buildPlan('.agents/plans/payments/02-b.md')
        const issue = existingIssue(second)
        const github = new FakeGitHub([issue], [{ id: 'item-9', contentUrl: issue.url, status: 'Todo' }])

        const outcomes = await synchronizer(github).sync([first, second])

        expect(outcomes.map(outcome => outcome.issueAction)).toEqual(['created', 'unchanged'])
        expect(github.created).toHaveLength(1)
        expect(github.updated).toHaveLength(0)
    })
})
