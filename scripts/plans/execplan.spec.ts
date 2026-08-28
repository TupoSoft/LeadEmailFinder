import {
    BLOCKED_LABEL,
    EXECPLAN_LABEL,
    execPlanMarker,
    labelsFor,
    parseExecPlan,
    planKeyFromPath,
    renderIssueBody,
    resolvePlanStates,
} from './execplan'

function buildPlanFile(overrides: { dependencies?: string; progress?: string; readiness?: string } = {}): string {
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
        '## Plan dependencies',
        '',
        overrides.dependencies ?? 'None.',
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
            dependencies: [],
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
        ['Ready to implement after plan 01.', 'unknown'],
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

    it('reads stable dependency keys and preserves their order', (): void => {
        const plan = parseExecPlan(
            '.agents/plans/payments/03-a.md',
            buildPlanFile({ dependencies: '- `payments/01`\n- `payments/02`' }),
        )

        expect(plan.dependencies).toEqual(['payments/01', 'payments/02'])
    })

    it('accepts a missing dependency section for a fully completed legacy plan', (): void => {
        const contents = buildPlanFile({ progress: '- [x] Done.' }).replace('## Plan dependencies\n\nNone.\n\n', '')

        expect(parseExecPlan('.agents/plans/f/01-a.md', contents).dependencies).toEqual([])
    })

    it('rejects a missing dependency section for an incomplete plan', (): void => {
        const contents = buildPlanFile({ progress: '- [ ] Not done.' }).replace('## Plan dependencies\n\nNone.\n\n', '')

        expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
            'is missing a "## Plan dependencies" section',
        )
    })

    it.each([
        ['- payments/01', 'invalid Plan dependencies entry'],
        ['- `payments/01`\n- `payments/01`', 'declares dependency payments/01 more than once'],
    ])('rejects invalid dependencies: %s', (dependencies, message): void => {
        expect(() =>
            parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies })),
        ).toThrow(message)
    })

    it.each(['## Plan Dependencies', '## PLAN DEPENDENCIES', '## plan dependencies'])(
        'rejects a near-miss "Plan dependencies" heading: %s',
        (heading): void => {
            const contents = buildPlanFile().replace('## Plan dependencies', heading)

            expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
                `malformed heading "${heading.trim()}"; expected exactly "## Plan dependencies"`,
            )
        },
    )

    it.each(['## Plan Readiness', '## PLAN READINESS', '## plan readiness'])(
        'rejects a near-miss "Plan readiness" heading: %s',
        (heading): void => {
            const contents = buildPlanFile().replace('## Plan readiness', heading)

            expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
                `malformed heading "${heading.trim()}"; expected exactly "## Plan readiness"`,
            )
        },
    )

    it('rejects a missing "Plan readiness" section even for a fully completed plan', (): void => {
        const contents = buildPlanFile({ progress: '- [x] Done.' }).replace(
            '## Plan readiness\n\nReady to implement.\n',
            '',
        )

        expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
            'is missing a nonempty "## Plan readiness" section',
        )
    })

    it('rejects an empty "Plan readiness" section', (): void => {
        const contents = buildPlanFile({ readiness: '' })

        expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
            'is missing a nonempty "## Plan readiness" section',
        )
    })
})

function stateFor(progress: string, readiness = 'Ready to implement.'): string | undefined {
    const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress, readiness }))
    return resolvePlanStates([plan]).get(plan.key)?.status
}

describe('resolvePlanStates', (): void => {
    it.each([
        ['- [ ] One.\n- [ ] Two.', 'Todo'],
        ['- [x] One.\n- [ ] Two.', 'In Progress'],
        ['- [x] One.\n- [x] Two.', 'Done'],
    ])('maps %s to %s', (progress, expected): void => {
        expect(stateFor(progress)).toBe(expected)
    })

    it.each(['Ready after a decision.', 'Blocked by missing evidence.', 'Unexpected wording.'])(
        'keeps unready plan wording in Backlog: %s',
        (readiness): void => {
            expect(stateFor('- [ ] Work.', readiness)).toBe('Backlog')
        },
    )

    it('keeps a ready root with no progress checkboxes in Todo without treating it as complete', (): void => {
        expect(stateFor('None yet.')).toBe('Todo')
    })

    it('promotes a plan only after every dependency is complete', (): void => {
        const first = parseExecPlan(
            '.agents/plans/f/01-a.md',
            buildPlanFile({ progress: '- [x] Complete.' }),
        )
        const second = parseExecPlan(
            '.agents/plans/f/02-b.md',
            buildPlanFile({ dependencies: '- `f/01`', progress: '- [ ] Work.' }),
        )

        expect(resolvePlanStates([first, second]).get('f/02')).toEqual({ status: 'Todo' })

        first.progress.completed = 0
        expect(resolvePlanStates([first, second]).get('f/02')).toEqual({
            status: 'Backlog',
            detail: 'Waiting for `f/01`.',
        })
    })

    it('does not satisfy a dependency that has no progress checkboxes', (): void => {
        const first = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress: 'None yet.' }))
        const second = parseExecPlan(
            '.agents/plans/f/02-b.md',
            buildPlanFile({ dependencies: '- `f/01`', progress: '- [ ] Work.' }),
        )

        expect(resolvePlanStates([first, second]).get('f/02')?.status).toBe('Backlog')
    })

    it('keeps started work In Progress even when a dependency is incomplete', (): void => {
        const first = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress: '- [ ] Work.' }))
        const second = parseExecPlan(
            '.agents/plans/f/02-b.md',
            buildPlanFile({ dependencies: '- `f/01`', progress: '- [x] Started.\n- [ ] Finish.' }),
        )

        expect(resolvePlanStates([first, second]).get('f/02')?.status).toBe('In Progress')
    })

    it.each([
        [
            [parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies: '- `f/99`' }))],
            'depends on missing ExecPlan f/99',
        ],
        [
            [parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies: '- `f/01`' }))],
            'cannot depend on itself',
        ],
        [
            [
                parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies: '- `f/02`' })),
                parseExecPlan('.agents/plans/f/02-b.md', buildPlanFile({ dependencies: '- `f/01`' })),
            ],
            'ExecPlan dependency cycle: f/01 -> f/02 -> f/01',
        ],
        [
            [
                parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile()),
                parseExecPlan('.agents/plans/f/01-renamed.md', buildPlanFile()),
            ],
            'Duplicate ExecPlan key f/01',
        ],
    ])('rejects an invalid dependency graph', (plans, message): void => {
        expect(() => resolvePlanStates(plans)).toThrow(message)
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

    it('does not apply the blocked label to unknown readiness wording', (): void => {
        const plan = parseExecPlan(
            '.agents/plans/f/01-a.md',
            buildPlanFile({ readiness: 'Unexpected readiness wording.' }),
        )

        expect(labelsFor(plan)).toEqual([EXECPLAN_LABEL])
    })
})

describe('renderIssueBody', (): void => {
    it('embeds the marker, a link to the plan, and the overwrite warning', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-idempotent-credit-grants.md', buildPlanFile())
        const state = resolvePlanStates([plan]).get(plan.key)

        expect(state).toBeDefined()
        const body = renderIssueBody(plan, state!, 'https://github.com/TupoSoft/LeadEmailFinder/blob/master')

        expect(body).toContain(execPlanMarker('payments/01'))
        expect(body).toContain(
            '(https://github.com/TupoSoft/LeadEmailFinder/blob/master/.agents/plans/payments/01-idempotent-credit-grants.md)',
        )
        expect(body).toContain('overwritten on the next sync')
        expect(body).toContain('Make adding credits as safe as spending them.')
        expect(body).toContain('- Dependencies: None.')
        expect(body).toContain('- Progress: 0 of 2 tasks complete.')
        expect(body).toContain('- Effective status: Todo')
    })

    it('renders identically for identical input so repeated syncs do not edit issues', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-a.md', buildPlanFile())
        const baseUrl = 'https://github.com/TupoSoft/LeadEmailFinder/blob/master'
        const state = resolvePlanStates([plan]).get(plan.key)!

        expect(renderIssueBody(plan, state, baseUrl)).toBe(renderIssueBody(plan, state, baseUrl))
    })

    it('tolerates a base URL with a trailing slash', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-a.md', buildPlanFile())
        const state = resolvePlanStates([plan]).get(plan.key)!

        expect(renderIssueBody(plan, state, 'https://example.test/blob/master/')).toContain(
            '(https://example.test/blob/master/.agents/plans/payments/01-a.md)',
        )
    })
})
