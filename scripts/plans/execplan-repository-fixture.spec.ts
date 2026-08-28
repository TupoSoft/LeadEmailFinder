import { resolve } from 'node:path'
import { discoverExecPlans, resolvePlanStates } from './execplan'

/**
 * Discovers every checked-in ExecPlan and proves parsing and dependency-state resolution succeed
 * against the real repository, not only synthetic fixtures. A malformed real plan (a near-miss
 * heading, a missing readiness section, an unresolvable dependency) fails this test the same way it
 * would fail `pnpm plans:sync`, before any GitHub interaction.
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

        const states = resolvePlanStates(plans)
        expect(states.size).toBe(plans.length)
    })
})
