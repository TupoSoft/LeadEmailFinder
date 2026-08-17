import { desiredStatus, ExecPlan, execPlanMarker, labelsFor, ProjectStatus, renderIssueBody } from './execplan'
import { EXECPLAN_LABEL_DEFINITIONS, GitHubProjectPort, IssueSummary } from './github-project-api'

export type IssueAction = 'created' | 'updated' | 'unchanged'

export interface SyncOutcome {
    key: string
    issueNumber?: number
    issueAction: IssueAction
    status: ProjectStatus
    statusApplied: boolean
    addedToProject: boolean
}

export interface SyncOptions {
    /** Base URL a plan path is appended to, e.g. `https://github.com/<repo>/blob/master`. */
    blobBaseUrl: string
    dryRun: boolean
}

export class ExecPlanSynchronizer {
    constructor(
        private readonly github: GitHubProjectPort,
        private readonly options: SyncOptions,
    ) {}

    async sync(plans: ExecPlan[]): Promise<SyncOutcome[]> {
        if (!this.options.dryRun) {
            await this.github.ensureLabels(EXECPLAN_LABEL_DEFINITIONS)
        }

        const issues = await this.github.listExecPlanIssues()
        const items = await this.github.listProjectItems()
        const outcomes: SyncOutcome[] = []

        for (const plan of plans) {
            outcomes.push(await this.syncPlan(plan, issues, items))
        }

        return outcomes
    }

    private async syncPlan(
        plan: ExecPlan,
        issues: IssueSummary[],
        items: Awaited<ReturnType<GitHubProjectPort['listProjectItems']>>,
    ): Promise<SyncOutcome> {
        const marker = execPlanMarker(plan.key)
        const existing = issues.find(issue => issue.body.includes(marker))
        const content = {
            title: plan.title,
            body: renderIssueBody(plan, this.options.blobBaseUrl),
            labels: labelsFor(plan),
        }
        const status = desiredStatus(plan)

        if (!existing) {
            if (this.options.dryRun) {
                return { key: plan.key, issueAction: 'created', status, statusApplied: false, addedToProject: false }
            }

            const created = await this.github.createIssue(content)
            issues.push(created)
            const itemId = await this.github.addIssueToProject(created.url)
            await this.github.setItemStatus(itemId, status)

            return {
                key: plan.key,
                issueNumber: created.number,
                issueAction: 'created',
                status,
                statusApplied: true,
                addedToProject: true,
            }
        }

        const issueAction: IssueAction =
            existing.title === content.title && existing.body === content.body ? 'unchanged' : 'updated'

        if (issueAction === 'updated' && !this.options.dryRun) {
            await this.github.updateIssue(existing.number, content)
            existing.title = content.title
            existing.body = content.body
        }

        const item = items.find(candidate => candidate.contentUrl === existing.url)
        let itemId = item?.id
        let addedToProject = false

        if (!itemId && !this.options.dryRun) {
            itemId = await this.github.addIssueToProject(existing.url)
            items.push({ id: itemId, contentUrl: existing.url })
            addedToProject = true
        }

        // A plan whose file is edited after completion must not reopen on the board, and a human
        // marking something Done ahead of the file should not be overruled by a generated process.
        const statusNeedsApplying = item?.status !== status && item?.status !== 'Done'
        const statusApplied = Boolean(itemId) && statusNeedsApplying && !this.options.dryRun

        if (statusApplied && itemId) {
            await this.github.setItemStatus(itemId, status)
        }

        return {
            key: plan.key,
            issueNumber: existing.number,
            issueAction,
            status,
            statusApplied,
            addedToProject: addedToProject || (this.options.dryRun && !item),
        }
    }
}
