import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { BLOCKED_LABEL, EXECPLAN_LABEL, ProjectStatus } from './execplan'

const run = promisify(execFile)

/** Labels this sync owns. Any label outside this list is left alone on an issue. */
const MANAGED_LABELS = [EXECPLAN_LABEL, BLOCKED_LABEL]

export interface IssueSummary {
    number: number
    url: string
    title: string
    body: string
}

export interface ProjectItemSummary {
    id: string
    contentUrl?: string
    status?: string
}

export interface IssueContent {
    title: string
    body: string
    labels: string[]
}

export interface LabelDefinition {
    name: string
    color: string
    description: string
}

/**
 * Everything the synchronizer needs from GitHub. Keeping project ids, field ids, and option ids
 * inside the adapter is what lets the synchronizer be tested without a GitHub account.
 */
export interface GitHubProjectPort {
    validateStatusOptions(statuses: readonly ProjectStatus[]): Promise<void>
    ensureLabels(labels: LabelDefinition[]): Promise<void>
    listExecPlanIssues(): Promise<IssueSummary[]>
    createIssue(content: IssueContent): Promise<IssueSummary>
    updateIssue(issueNumber: number, content: IssueContent): Promise<void>
    listProjectItems(): Promise<ProjectItemSummary[]>
    addIssueToProject(issueUrl: string): Promise<string>
    setItemStatus(itemId: string, status: ProjectStatus): Promise<void>
}

export interface GitHubCliOptions {
    repository: string
    projectOwner: string
    projectNumber: string
}

interface StatusFieldMetadata {
    projectId: string
    fieldId: string
    optionIds: Map<string, string>
}

interface GhSingleSelectOption {
    id: string
    name: string
}

interface GhField {
    id: string
    name: string
    options?: GhSingleSelectOption[]
}

interface GhProjectItem {
    id: string
    status?: string
    content?: { url?: string }
}

export const EXECPLAN_LABEL_DEFINITIONS: LabelDefinition[] = [
    { name: EXECPLAN_LABEL, color: '0E8A16', description: 'Generated from an ExecPlan under .agents/plans/' },
    { name: BLOCKED_LABEL, color: 'B60205', description: 'ExecPlan requires a decision or missing evidence' },
]

export class GitHubCliProjectApi implements GitHubProjectPort {
    private statusField?: StatusFieldMetadata

    constructor(private readonly options: GitHubCliOptions) {}

    private async gh(args: string[]): Promise<string> {
        try {
            const { stdout } = await run('gh', args, { maxBuffer: 32 * 1024 * 1024 })
            return stdout
        } catch (error: unknown) {
            const stderr = typeof error === 'object' && error && 'stderr' in error ? String(error.stderr) : ''
            throw new Error(`gh ${args[0]} ${args[1] ?? ''} failed: ${stderr.trim() || String(error)}`)
        }
    }

    private async ghJson<T>(args: string[]): Promise<T> {
        return JSON.parse(await this.gh(args)) as T
    }

    private projectArgs(): string[] {
        return [this.options.projectNumber, '--owner', this.options.projectOwner]
    }

    async ensureLabels(labels: LabelDefinition[]): Promise<void> {
        for (const label of labels) {
            // --force updates an existing label instead of failing, making this safe to repeat.
            await this.gh([
                'label',
                'create',
                label.name,
                '--repo',
                this.options.repository,
                '--color',
                label.color,
                '--description',
                label.description,
                '--force',
            ])
        }
    }

    async listExecPlanIssues(): Promise<IssueSummary[]> {
        return this.ghJson<IssueSummary[]>([
            'issue',
            'list',
            '--repo',
            this.options.repository,
            '--label',
            EXECPLAN_LABEL,
            '--state',
            'all',
            '--limit',
            '500',
            '--json',
            'number,url,title,body',
        ])
    }

    async createIssue(content: IssueContent): Promise<IssueSummary> {
        const args = [
            'issue',
            'create',
            '--repo',
            this.options.repository,
            '--title',
            content.title,
            '--body',
            content.body,
        ]

        for (const label of content.labels) {
            args.push('--label', label)
        }

        const url = (await this.gh(args)).trim().split('\n').at(-1) ?? ''
        const issueNumber = Number.parseInt(url.split('/').at(-1) ?? '', 10)

        if (!Number.isInteger(issueNumber)) {
            throw new Error(`Could not read an issue number from gh issue create output: ${url}`)
        }

        return { number: issueNumber, url, title: content.title, body: content.body }
    }

    async updateIssue(issueNumber: number, content: IssueContent): Promise<void> {
        const args = [
            'issue',
            'edit',
            String(issueNumber),
            '--repo',
            this.options.repository,
            '--title',
            content.title,
            '--body',
            content.body,
        ]

        for (const label of MANAGED_LABELS) {
            args.push(content.labels.includes(label) ? '--add-label' : '--remove-label', label)
        }

        await this.gh(args)
    }

    async listProjectItems(): Promise<ProjectItemSummary[]> {
        const { items } = await this.ghJson<{ items: GhProjectItem[] }>([
            'project',
            'item-list',
            ...this.projectArgs(),
            '--limit',
            '500',
            '--format',
            'json',
        ])

        return items.map(item => ({ id: item.id, contentUrl: item.content?.url, status: item.status }))
    }

    async addIssueToProject(issueUrl: string): Promise<string> {
        const { id } = await this.ghJson<{ id: string }>([
            'project',
            'item-add',
            ...this.projectArgs(),
            '--url',
            issueUrl,
            '--format',
            'json',
        ])

        return id
    }

    private async resolveStatusField(): Promise<StatusFieldMetadata> {
        if (this.statusField) {
            return this.statusField
        }

        const [{ id: projectId }, { fields }] = await Promise.all([
            this.ghJson<{ id: string }>(['project', 'view', ...this.projectArgs(), '--format', 'json']),
            this.ghJson<{ fields: GhField[] }>(['project', 'field-list', ...this.projectArgs(), '--format', 'json']),
        ])

        const status = fields.find(field => field.name === 'Status')

        if (!status?.options?.length) {
            throw new Error(`Project ${this.options.projectOwner}/${this.options.projectNumber} has no Status field`)
        }

        this.statusField = {
            projectId,
            fieldId: status.id,
            optionIds: new Map(status.options.map(option => [option.name, option.id])),
        }

        return this.statusField
    }

    async validateStatusOptions(statuses: readonly ProjectStatus[]): Promise<void> {
        const { optionIds } = await this.resolveStatusField()
        const missing = statuses.filter(status => !optionIds.has(status))

        if (missing.length > 0) {
            throw new Error(
                `Project ${this.options.projectOwner}/${this.options.projectNumber} Status is missing: ${missing.join(', ')}`,
            )
        }
    }

    async setItemStatus(itemId: string, status: ProjectStatus): Promise<void> {
        const { projectId, fieldId, optionIds } = await this.resolveStatusField()
        const optionId = optionIds.get(status)

        if (!optionId) {
            throw new Error(`Status option "${status}" does not exist on the project`)
        }

        await this.gh([
            'project',
            'item-edit',
            '--id',
            itemId,
            '--project-id',
            projectId,
            '--field-id',
            fieldId,
            '--single-select-option-id',
            optionId,
        ])
    }
}
