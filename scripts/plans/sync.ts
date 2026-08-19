import {
    ExecPlan,
    ExecPlanState,
    execPlanMarker,
    labelsFor,
    PROJECT_STATUSES,
    ProjectStatus,
    renderIssueBody,
    resolvePlanStates,
} from './execplan'
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
        const states = resolvePlanStates(plans)
        await this.github.validateStatusOptions(PROJECT_STATUSES)

        if (!this.options.dryRun) {
            await this.github.ensureLabels(EXECPLAN_LABEL_DEFINITIONS)
        }

        const issues = await this.github.listExecPlanIssues()
        const items = await this.github.listProjectItems()
        const outcomes: SyncOutcome[] = []

        for (const plan of plans) {
            const state = states.get(plan.key)

            if (!state) {
                throw new Error(`No resolved state for ${plan.key}`)
            }

            outcomes.push(await this.syncPlan(plan, state, issues, items))
        }

        return outcomes
    }

    private async syncPlan(
        plan: ExecPlan,
        state: ExecPlanState,
        issues: IssueSummary[],
        items: Awaited<ReturnType<GitHubProjectPort['listProjectItems']>>,
    ): Promise<SyncOutcome> {
        const marker = execPlanMarker(plan.key)
        const existing = issues.find(issue => issue.body.includes(marker))
        const content = {
            title: plan.title,
            body: renderIssueBody(plan, state, this.options.blobBaseUrl),
            labels: labelsFor(plan),
        }
        const status = state.status

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

        // Preserve explicit human signals that work is already active or complete. An assigned
        // In Progress item may still advance to Done, but repository lag must not move it backwards.
        const preservesAssignedWork =
            item?.status === 'In Progress' &&
            existing.assignees.length > 0 &&
            (status === 'Todo' || status === 'Backlog')
        const statusNeedsApplying = item?.status !== status && item?.status !== 'Done' && !preservesAssignedWork
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
