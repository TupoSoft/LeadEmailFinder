export const EXECPLAN_LABEL = 'execplan'
export const BLOCKED_LABEL = 'blocked'

export const PROJECT_STATUSES = ['Todo', 'In Progress', 'Done'] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export type ReadinessState = 'ready' | 'conditional' | 'blocked' | 'unknown'

export interface ExecPlanProgress {
    total: number
    completed: number
}

export interface ExecPlanReadiness {
    state: ReadinessState
    text: string
}

export interface ExecPlan {
    /** Stable identity of the plan, shaped `<feature>/<NN>`, e.g. `payments/01`. */
    key: string
    /** Repository-relative path, e.g. `.agents/plans/payments/01-idempotent-credit-grants.md`. */
    path: string
    title: string
    purpose: string
    readiness: ExecPlanReadiness
    progress: ExecPlanProgress
}

const CHECKBOX_PATTERN = /^\s*-\s*\[( |x|X)\]/

/**
 * Derives the stable plan key from a plan path. The key deliberately uses the numeric prefix rather
 * than the full slug so retitling a plan file keeps it matched to its existing issue.
 * Returns `undefined` for files that are not plans, such as a feature `README.md`.
 */
export function planKeyFromPath(planPath: string): string | undefined {
    const segments = planPath.replace(/\\/g, '/').split('/')
    const fileName = segments.at(-1)
    const feature = segments.at(-2)

    if (!fileName || !feature) {
        return undefined
    }

    const numericPrefix = /^(\d+)-.+\.md$/.exec(fileName)

    return numericPrefix ? `${feature}/${numericPrefix[1]}` : undefined
}

function readSection(contents: string, heading: string): string {
    const lines = contents.split('\n')
    const start = lines.findIndex(line => line.trim() === `## ${heading}`)

    if (start === -1) {
        return ''
    }

    const rest = lines.slice(start + 1)
    const end = rest.findIndex(line => line.startsWith('## '))

    return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

function classifyReadiness(text: string): ReadinessState {
    if (text.startsWith('Ready to implement')) {
        return 'ready'
    }

    if (text.startsWith('Ready after')) {
        return 'conditional'
    }

    if (text.startsWith('Blocked by')) {
        return 'blocked'
    }

    return 'unknown'
}

function readProgress(contents: string): ExecPlanProgress {
    const checkboxes = readSection(contents, 'Progress')
        .split('\n')
        .map(line => CHECKBOX_PATTERN.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)

    return {
        total: checkboxes.length,
        completed: checkboxes.filter(match => match[1].toLowerCase() === 'x').length,
    }
}

export function parseExecPlan(planPath: string, contents: string): ExecPlan {
    const key = planKeyFromPath(planPath)

    if (!key) {
        throw new Error(`${planPath} is not an ExecPlan: expected a NN-<slug>.md file inside a feature directory`)
    }

    const title = /^#\s+(.+)$/m.exec(contents)?.[1].trim()

    if (!title) {
        throw new Error(`${planPath} has no level-one heading to use as an issue title`)
    }

    const readinessText = readSection(contents, 'Plan readiness')

    return {
        key,
        path: planPath.replace(/\\/g, '/'),
        title,
        purpose: readSection(contents, 'Purpose / Big Picture'),
        readiness: { state: classifyReadiness(readinessText), text: readinessText },
        progress: readProgress(contents),
    }
}

export function execPlanMarker(key: string): string {
    return `<!-- execplan: ${key} -->`
}

export function labelsFor(plan: ExecPlan): string[] {
    const blocked = plan.readiness.state === 'conditional' || plan.readiness.state === 'blocked'

    return blocked ? [EXECPLAN_LABEL, BLOCKED_LABEL] : [EXECPLAN_LABEL]
}

/**
 * Derives board status from the plan's own checkboxes, so progress is recorded in exactly one place.
 * The board therefore lags reality by one commit, which is acceptable for a generated mirror.
 */
export function desiredStatus(plan: ExecPlan): ProjectStatus {
    const { total, completed } = plan.progress

    if (total > 0 && completed === total) {
        return 'Done'
    }

    return completed > 0 ? 'In Progress' : 'Todo'
}

export function renderIssueBody(plan: ExecPlan, blobBaseUrl: string): string {
    const link = `${blobBaseUrl.replace(/\/$/, '')}/${plan.path}`
    const { completed, total } = plan.progress

    return [
        execPlanMarker(plan.key),
        `Generated from [\`${plan.path}\`](${link}) by \`pnpm plans:sync\`. Edits to this description are`,
        'overwritten on the next sync; use comments for discussion.',
        '',
        '## Purpose',
        '',
        plan.purpose,
        '',
        '## Plan state',
        '',
        `- Readiness: ${plan.readiness.text || 'not stated'}`,
        `- Progress: ${completed} of ${total} tasks complete.`,
        '',
    ].join('\n')
}
