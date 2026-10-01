import { resolve } from 'node:path'
import { discoverExecPlans, resolvePlanStates, type ExecPlan } from './execplan'

/**
 * Discovers every checked-in ExecPlan and proves parsing and dependency-state resolution succeed
 * against the real repository, not only synthetic fixtures. A malformed real plan (a near-miss
 * heading, a missing readiness section, an unresolvable dependency) fails this test the same way it
 * would fail `pnpm plans:sync`, before any GitHub interaction. Unrecognized readiness in incomplete
 * plans also fails here so actionable plans cannot silently disappear into Backlog.
 */
describe('ExecPlan repository fixture', () => {
    const repositoryRoot = resolve(__dirname, '..', '..')
    const plansRoot = resolve(repositoryRoot, '.agents/plans')

    it('parses every checked-in ExecPlan and resolves the complete dependency graph', async () => {
        const plans = await discoverExecPlans(plansRoot, repositoryRoot)

        expect(plans.length).toBeGreaterThan(0)

        for (const plan of plans) {
            expect(plan.readiness.text.length).toBeGreaterThan(0)
        }

        const unrecognizedReadiness = plans
            .filter(plan => plan.progress.total === 0 || plan.progress.completed < plan.progress.total)
            .filter(plan => plan.readiness.state === 'unknown')
            .map(plan => plan.path)
        expect(unrecognizedReadiness).toEqual([])

        const states = resolvePlanStates(plans)
        expect(states.size).toBe(plans.length)
    })

    /**
     * Real completion happens by editing checked-in Markdown; these scenarios simulate that by
     * cloning the real, currently-incomplete plans and marking specific ones "done" in memory only,
     * so the scheduling assertions below exercise the actual repository dependency graph (not a
     * synthetic replacement) without writing anything back to disk.
     */
    describe('mcp-connector/07 scheduling (mcp-connector-hardening/04 regression coverage)', () => {
        let plans: ExecPlan[]

        beforeAll(async () => {
            plans = await discoverExecPlans(plansRoot, repositoryRoot)
        })

        const SUBJECT = 'mcp-connector/07'

        /**
         * `forceIncompleteKeys` resets specific plans to incomplete regardless of their real, current
         * checked-in progress -- without it, a scenario built to prove "07 stays Backlog while plan X is
         * incomplete" would silently stop testing anything once X's real implementation actually
         * finishes, since `plans` reflects the live repository, not a frozen snapshot. `SUBJECT` itself
         * (`mcp-connector/07`, the plan every scenario in this block schedules) is always forced
         * incomplete for exactly the same reason: every scenario here tests "is 07 eligible yet", a
         * question that stops being meaningful the moment 07's own real progress reaches 100% -- as it
         * now permanently has, since this plan actually shipped.
         */
        function withCompleted(doneKeys: readonly string[], forceIncompleteKeys: readonly string[] = []): ExecPlan[] {
            const done = new Set(doneKeys)
            const forceIncomplete = new Set([SUBJECT, ...forceIncompleteKeys])

            return plans.map(plan => {
                const clone = structuredClone(plan)

                if (forceIncomplete.has(clone.key)) {
                    clone.progress = { total: Math.max(clone.progress.total, 1), completed: 0 }
                } else if (done.has(clone.key)) {
                    const total = Math.max(clone.progress.total, 1)
                    clone.progress = { total, completed: total }
                }

                return clone
            })
        }

        const everyOtherPrerequisite = [
            'mcp-connector/01',
            'mcp-connector/02',
            'mcp-connector/03',
            'mcp-connector/04',
            'mcp-connector/05',
            'mcp-connector/06',
            'mcp-connector-hardening/01',
            'mcp-connector-hardening/02',
            'mcp-connector-hardening/03',
            'mcp-connector-hardening/04',
        ] as const

        it('stays in Backlog and names the missing tool plan when only mcp-connector/04 is incomplete', () => {
            const doneKeys = everyOtherPrerequisite.filter(key => key !== 'mcp-connector/04')
            const states = resolvePlanStates(withCompleted(doneKeys, ['mcp-connector/04']))

            expect(states.get('mcp-connector/07')).toMatchObject({
                status: 'Backlog',
                detail: expect.stringContaining('`mcp-connector/04`'),
            })
        })

        it('stays in Backlog and names the missing tool plan when only mcp-connector/05 is incomplete', () => {
            const doneKeys = everyOtherPrerequisite.filter(key => key !== 'mcp-connector/05')
            const states = resolvePlanStates(withCompleted(doneKeys, ['mcp-connector/05']))

            expect(states.get('mcp-connector/07')).toMatchObject({
                status: 'Backlog',
                detail: expect.stringContaining('`mcp-connector/05`'),
            })
        })

        it('stays in Backlog and names the missing deployment plan when only mcp-connector/06 is incomplete', () => {
            const doneKeys = everyOtherPrerequisite.filter(key => key !== 'mcp-connector/06')
            const states = resolvePlanStates(withCompleted(doneKeys, ['mcp-connector/06']))

            expect(states.get('mcp-connector/07')).toMatchObject({
                status: 'Backlog',
                detail: expect.stringContaining('`mcp-connector/06`'),
            })
        })

        it('stays in Backlog and names the missing desktop bridge plan when only mcp-connector-hardening/03 is incomplete', () => {
            const doneKeys = everyOtherPrerequisite.filter(key => key !== 'mcp-connector-hardening/03')
            const states = resolvePlanStates(withCompleted(doneKeys, ['mcp-connector-hardening/03']))

            expect(states.get('mcp-connector/07')).toMatchObject({
                status: 'Backlog',
                detail: expect.stringContaining('`mcp-connector-hardening/03`'),
            })
        })

        it('becomes Todo, with no progress items of its own complete, once every direct prerequisite is done', () => {
            const simulated = withCompleted(everyOtherPrerequisite)
            const plan07 = simulated.find(plan => plan.key === SUBJECT)

            expect(plan07?.progress.completed).toBe(0)
            expect(resolvePlanStates(simulated).get(SUBJECT)).toEqual({ status: 'Todo' })
        })

        it('reproduces the original failure: completing only the original scaffold, auth, client, and deployment plans cannot make final validation eligible', () => {
            // Mirrors the pre-fix graph's own incomplete slice: only plans 01/02/03/06 done among the
            // original seven, with every corrective plan done so it cannot mask the still-missing tool
            // plans. Before this fix, plan 07 depended only on plan 06, so this exact combination would
            // have incorrectly resolved to `Todo`.
            const doneKeys = [
                'mcp-connector/01',
                'mcp-connector/02',
                'mcp-connector/03',
                'mcp-connector/06',
                'mcp-connector-hardening/01',
                'mcp-connector-hardening/02',
                'mcp-connector-hardening/03',
                'mcp-connector-hardening/04',
            ]
            const states = resolvePlanStates(withCompleted(doneKeys, ['mcp-connector/04', 'mcp-connector/05']))

            expect(states.get('mcp-connector/07')?.status).toBe('Backlog')
        })
    })
})
