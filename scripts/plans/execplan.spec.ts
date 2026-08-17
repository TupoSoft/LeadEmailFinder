import {
    BLOCKED_LABEL,
    desiredStatus,
    EXECPLAN_LABEL,
    execPlanMarker,
    labelsFor,
    parseExecPlan,
    planKeyFromPath,
    renderIssueBody,
} from './execplan'

function buildPlanFile(overrides: { progress?: string; readiness?: string } = {}): string {
    return [
        '# Grant credits idempotently',
        '',
        'This ExecPlan is a living document maintained according to `.agents/PLANS.md`.',
        '',
        '## Purpose / Big Picture',
        '',
        'Make adding credits as safe as spending them.',
        '',
        '## Progress',
        '',
        overrides.progress ?? '- [ ] Add the entity.\n- [ ] Add the service method.',
        '',
        '## Decision Log',
        '',
        '- Decision: something else entirely.',
        '',
        '## Plan readiness',
        '',
        overrides.readiness ?? 'Ready to implement.',
        '',
    ].join('\n')
}

describe('planKeyFromPath', (): void => {
    it('keys a plan by feature and numeric prefix so renaming the slug keeps its identity', (): void => {
        expect(planKeyFromPath('.agents/plans/payments/01-idempotent-credit-grants.md')).toBe('payments/01')
        expect(planKeyFromPath('.agents/plans/payments/01-renamed-entirely.md')).toBe('payments/01')
    })

    it('ignores files that are not plans', (): void => {
        expect(planKeyFromPath('.agents/plans/payments/README.md')).toBeUndefined()
        expect(planKeyFromPath('.agents/PLANS.md')).toBeUndefined()
    })
})

describe('parseExecPlan', (): void => {
    it('reads the title, purpose, readiness, and checkbox counts', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-idempotent-credit-grants.md', buildPlanFile())

        expect(plan).toMatchObject({
            key: 'payments/01',
            title: 'Grant credits idempotently',
            purpose: 'Make adding credits as safe as spending them.',
            readiness: { state: 'ready', text: 'Ready to implement.' },
            progress: { total: 2, completed: 0 },
        })
    })

    it('counts only checkboxes in the Progress section', (): void => {
        const plan = parseExecPlan(
            '.agents/plans/payments/01-a.md',
            buildPlanFile({ progress: '- [x] Done one.\n- [X] Done two.\n- [ ] Not yet.' }),
        )

        expect(plan.progress).toEqual({ total: 3, completed: 2 })
    })

    it.each([
        ['Ready to implement.', 'ready'],
        ['Ready to implement after plan 01.', 'ready'],
        ['Ready after the clawback policy decision.', 'conditional'],
        ['Blocked by missing sandbox credentials.', 'blocked'],
        ['Something nobody expected.', 'unknown'],
    ])('classifies readiness %s as %s', (readiness, expected): void => {
        expect(parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ readiness })).readiness.state).toBe(expected)
    })

    it('rejects a file that is not an ExecPlan', (): void => {
        expect(() => parseExecPlan('.agents/plans/payments/README.md', buildPlanFile())).toThrow('is not an ExecPlan')
    })

    it('rejects a plan with no level-one heading', (): void => {
        expect(() => parseExecPlan('.agents/plans/f/01-a.md', '## Purpose / Big Picture\n\nNothing.')).toThrow(
            'no level-one heading',
        )
    })
})

describe('desiredStatus', (): void => {
    it.each([
        ['- [ ] One.\n- [ ] Two.', 'Todo'],
        ['- [x] One.\n- [ ] Two.', 'In Progress'],
        ['- [x] One.\n- [x] Two.', 'Done'],
    ])('maps %s to %s', (progress, expected): void => {
        expect(desiredStatus(parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress })))).toBe(expected)
    })

    it('treats a plan with no checkboxes as Todo rather than complete', (): void => {
        expect(desiredStatus(parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress: 'None yet.' })))).toBe(
            'Todo',
        )
    })
})

describe('labelsFor', (): void => {
    it('labels a ready plan with the ExecPlan label only', (): void => {
        const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile())

        expect(labelsFor(plan)).toEqual([EXECPLAN_LABEL])
    })

    it.each(['Ready after a decision.', 'Blocked by missing evidence.'])('marks %s as blocked', (readiness): void => {
        const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ readiness }))

        expect(labelsFor(plan)).toEqual([EXECPLAN_LABEL, BLOCKED_LABEL])
    })
})

describe('renderIssueBody', (): void => {
    it('embeds the marker, a link to the plan, and the overwrite warning', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-idempotent-credit-grants.md', buildPlanFile())

        const body = renderIssueBody(plan, 'https://github.com/TupoSoft/LeadEmailFinder/blob/master')

        expect(body).toContain(execPlanMarker('payments/01'))
        expect(body).toContain(
            '(https://github.com/TupoSoft/LeadEmailFinder/blob/master/.agents/plans/payments/01-idempotent-credit-grants.md)',
        )
        expect(body).toContain('overwritten on the next sync')
        expect(body).toContain('Make adding credits as safe as spending them.')
        expect(body).toContain('- Progress: 0 of 2 tasks complete.')
    })

    it('renders identically for identical input so repeated syncs do not edit issues', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-a.md', buildPlanFile())
        const baseUrl = 'https://github.com/TupoSoft/LeadEmailFinder/blob/master'

        expect(renderIssueBody(plan, baseUrl)).toBe(renderIssueBody(plan, baseUrl))
    })

    it('tolerates a base URL with a trailing slash', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-a.md', buildPlanFile())

        expect(renderIssueBody(plan, 'https://example.test/blob/master/')).toContain(
            '(https://example.test/blob/master/.agents/plans/payments/01-a.md)',
        )
    })
})
