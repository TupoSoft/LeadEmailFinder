import { BatchVerificationSnapshot } from './batch-jobs'
import { mapBatchVerificationStatus } from './batch-verification-status'

describe('mapBatchVerificationStatus', () => {
    it.each(['queued', 'running', 'unavailable'] as const)('returns only the public %s status', state => {
        expect(mapBatchVerificationStatus({ state, failureCode: 'invalid_csv', resultLocation: 's3://b/key' })).toEqual(
            {
                status: state,
            },
        )
    })

    it.each(['invalid_csv', 'insufficient_credits', 'processing_failed'] as const)(
        'exposes terminal failure code %s',
        failureCode => {
            expect(mapBatchVerificationStatus({ state: 'failed', failureCode })).toEqual({
                status: 'failed',
                failureCode,
            })
        },
    )

    it.each([undefined, null, {}, 'private parser error'])(
        'uses only the generic safe failure for a missing or invalid marker %#',
        failureCode => {
            expect(mapBatchVerificationStatus({ state: 'failed', failureCode })).toEqual({
                status: 'failed',
                failureCode: 'processing_failed',
            })
        },
    )

    it('does not expose a previous failed attempt after completion', () => {
        expect(
            mapBatchVerificationStatus({
                state: 'completed',
                resultLocation: 's3://bucket/results/file.csv',
                failureCode: 'processing_failed',
            }),
        ).toEqual({ status: 'completed' })
    })

    it.each([undefined, ''])(
        'reports an unavailable outcome when completed has no valid location %#',
        resultLocation => {
            expect(mapBatchVerificationStatus({ state: 'completed', resultLocation })).toEqual({
                status: 'unavailable',
            })
        },
    )

    it('conceals unknown future application states', () => {
        expect(
            mapBatchVerificationStatus({ state: 'private-future-state' } as unknown as BatchVerificationSnapshot),
        ).toEqual({
            status: 'unavailable',
        })
    })
})
