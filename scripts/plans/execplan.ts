export const EXECPLAN_LABEL = 'execplan'
export const BLOCKED_LABEL = 'blocked'

export const PROJECT_STATUSES = ['Backlog', 'Todo', 'In Progress', 'Done'] as const

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
    dependencies: string[]
    readiness: ExecPlanReadiness
    progress: ExecPlanProgress
}

export interface ExecPlanState {
    status: ProjectStatus
    detail?: string
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
    if (/^Ready to implement\.?$/.test(text)) {
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

function readDependencies(contents: string, planPath: string): string[] {
    const section = readSection(contents, 'Plan dependencies')

    // Completed legacy plans predate the structured section and remain valid.
    if (!section || section === 'None.') {
        return []
    }

    const dependencies = section.split('\n').map(line => {
        const key = /^\s*-\s+`([a-z0-9][a-z0-9-]*\/\d+)`\s*$/.exec(line)?.[1]

        if (!key) {
            throw new Error(`${planPath} has an invalid Plan dependencies entry: ${line}`)
        }

        return key
    })

    const duplicate = dependencies.find((key, index) => dependencies.indexOf(key) !== index)

    if (duplicate) {
        throw new Error(`${planPath} declares dependency ${duplicate} more than once`)
    }

    return dependencies
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
        dependencies: readDependencies(contents, planPath),
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

function terminalProgressStatus(plan: ExecPlan): ProjectStatus | undefined {
    const { total, completed } = plan.progress

    if (total > 0 && completed === total) {
        return 'Done'
    }

    return completed > 0 ? 'In Progress' : undefined
}

function validateDependencyGraph(plans: ExecPlan[]): Map<string, ExecPlan> {
    const byKey = new Map<string, ExecPlan>()

    for (const plan of plans) {
        if (byKey.has(plan.key)) {
            throw new Error(`Duplicate ExecPlan key ${plan.key}`)
        }

        byKey.set(plan.key, plan)
    }

    for (const plan of plans) {
        for (const dependency of plan.dependencies) {
            if (dependency === plan.key) {
                throw new Error(`${plan.key} cannot depend on itself`)
            }

            if (!byKey.has(dependency)) {
                throw new Error(`${plan.key} depends on missing ExecPlan ${dependency}`)
            }
        }
    }

    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (key: string, path: string[]): void => {
        if (visiting.has(key)) {
            const cycleStart = path.indexOf(key)
            throw new Error(`ExecPlan dependency cycle: ${[...path.slice(cycleStart), key].join(' -> ')}`)
        }

        if (visited.has(key)) {
            return
        }

        visiting.add(key)
        const nextPath = [...path, key]

        for (const dependency of byKey.get(key)?.dependencies ?? []) {
            visit(dependency, nextPath)
        }

        visiting.delete(key)
        visited.add(key)
    }

    for (const plan of plans) {
        visit(plan.key, [])
    }

    return byKey
}

/** Resolves every plan together so dependency readiness comes only from repository progress. */
export function resolvePlanStates(plans: ExecPlan[]): Map<string, ExecPlanState> {
    const byKey = validateDependencyGraph(plans)
    const states = new Map<string, ExecPlanState>()

    for (const plan of plans) {
        const terminalStatus = terminalProgressStatus(plan)

        if (terminalStatus) {
            states.set(plan.key, { status: terminalStatus })
            continue
        }

        if (plan.readiness.state !== 'ready') {
            const detail =
                plan.readiness.state === 'conditional'
                    ? `Decision required: ${plan.readiness.text}`
                    : plan.readiness.state === 'blocked'
                      ? plan.readiness.text
                      : 'Readiness is not stated in a recognized form.'
            states.set(plan.key, { status: 'Backlog', detail })
            continue
        }

        const incompleteDependencies = plan.dependencies.filter(dependency => {
            const dependencyPlan = byKey.get(dependency)
            return !dependencyPlan || terminalProgressStatus(dependencyPlan) !== 'Done'
        })

        states.set(
            plan.key,
            incompleteDependencies.length > 0
                ? {
                      status: 'Backlog',
                      detail: `Waiting for ${incompleteDependencies.map(key => `\`${key}\``).join(', ')}.`,
                  }
                : { status: 'Todo' },
        )
    }

    return states
}

export function renderIssueBody(plan: ExecPlan, state: ExecPlanState, blobBaseUrl: string): string {
    const link = `${blobBaseUrl.replace(/\/$/, '')}/${plan.path}`
    const { completed, total } = plan.progress
    const dependencies =
        plan.dependencies.length > 0 ? `${plan.dependencies.map(key => `\`${key}\``).join(', ')}.` : 'None.'
    const effectiveStatus = state.detail ? `${state.status} — ${state.detail}` : state.status

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
        `- Dependencies: ${dependencies}`,
        `- Progress: ${completed} of ${total} tasks complete.`,
        `- Effective status: ${effectiveStatus}`,
        '',
    ].join('\n')
}
