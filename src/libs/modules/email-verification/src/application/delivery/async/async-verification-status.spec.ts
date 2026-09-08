import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { AsyncVerificationSnapshot } from './async-verification-jobs'
import { mapAsyncVerificationStatus } from './async-verification-status'

const result = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'person@lef.test',
    localPart: 'person',
    domain: 'lef.test',
    exists: true,
    catchAll: null,
    reason: EmailVerificationReason.AcceptedEmail,
    sources: [EmailVerificationSource.MX],
}

describe('mapAsyncVerificationStatus', () => {
    it.each(['queued', 'running', 'unavailable'] as const)('exposes only %s regardless of extra data', state => {
        expect(mapAsyncVerificationStatus({ state, result })).toEqual({ state })
    })

    it('returns only the stable failure code and never reads failed job data', () => {
        const snapshot: AsyncVerificationSnapshot = {
            state: 'failed',
            get result() {
                throw new Error('must not read failed result')
            },
        }
        Object.defineProperty(snapshot, 'failedReason', {
            get() {
                throw new Error('must not read failure')
            },
        })
        expect(mapAsyncVerificationStatus(snapshot)).toEqual({ state: 'failed', failureCode: 'verification_failed' })
    })

    it('copies only reviewed result fields and strips diagnostics and timestamps', () => {
        const input = {
            ...result,
            format: EmailPatternEnum.First,
            mxDomain: 'lef.test',
            targetExchange: 'mx.lef.test',
            createdAt: '2026-09-07',
            organizationId: 'private',
            smtp: 'private',
            proxy: 'private',
            failedReason: 'private',
        }
        const status = mapAsyncVerificationStatus({ state: 'completed', result: input })
        expect(status).toEqual({
            state: 'completed',
            result: {
                ...result,
                format: EmailPatternEnum.First,
                mxDomain: 'lef.test',
                targetExchange: 'mx.lef.test',
            },
        })
        input.sources.push(EmailVerificationSource.MIMECAST)
        expect(status.state === 'completed' && status.result.sources).toEqual([EmailVerificationSource.MX])
    })

    it('omits nullable persistence fields when the queue returns database nulls', () => {
        expect(
            mapAsyncVerificationStatus({
                state: 'completed',
                result: {
                    ...result,
                    format: null,
                    mxDomain: null,
                    targetExchange: null,
                },
            }),
        ).toEqual({ state: 'completed', result })
    })

    it.each([true, false, null])('preserves nullable evidence value %s without coercion', value => {
        expect(
            mapAsyncVerificationStatus({ state: 'completed', result: { ...result, exists: value, catchAll: value } }),
        ).toEqual({ state: 'completed', result: { ...result, exists: value, catchAll: value } })
    })

    it.each([...Object.values(EmailVerificationSource), 'linkedin'])('preserves reviewed source %s', source => {
        const output = { ...result, sources: [source] }
        expect(mapAsyncVerificationStatus({ state: 'completed', result: output })).toEqual({
            state: 'completed',
            result: output,
        })
    })

    it.each(Object.values(EmailVerificationReason))('preserves reviewed reason %s', reason => {
        const output = { ...result, reason }
        expect(mapAsyncVerificationStatus({ state: 'completed', result: output })).toEqual({
            state: 'completed',
            result: output,
        })
    })

    it.each([
        undefined,
        null,
        [],
        'private queue output',
        {},
        { ...result, id: 'invalid' },
        { ...result, email: '' },
        { ...result, localPart: null },
        { ...result, domain: undefined },
        { ...result, exists: 'true' },
        { ...result, catchAll: undefined },
        { ...result, reason: 'provider diagnostics' },
        { ...result, sources: ['unreviewed-provider'] },
        { ...result, sources: null },
        { ...result, format: 'private pattern' },
        { ...result, mxDomain: {} },
        { ...result, targetExchange: 1 },
    ])('reports unavailable for invalid completed result %#', value => {
        expect(mapAsyncVerificationStatus({ state: 'completed', result: value })).toEqual({ state: 'unavailable' })
    })
})
