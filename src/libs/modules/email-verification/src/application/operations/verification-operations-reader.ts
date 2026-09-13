import { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionState, VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationFinalReason, VerificationRequestStore } from '../ports/verification-request-store'
import { VerificationResultReader } from '../verification-result-reader'

export type ReadOutcome =
    | {
          readonly kind: 'settled'
          readonly result: IEmailVerificationResponseDto | null
          readonly finalReason: VerificationFinalReason | null
          readonly chargedCount: 0 | 1
      }
    | { readonly kind: 'pending'; readonly executionState: VerificationExecutionState }
    | { readonly kind: 'not-found' }
    | { readonly kind: 'expired' }

const REQUEST_VISIBILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Reads one operation's current status by its public `requestId` handle. Settled requests stay visible and
 *  replayable for seven days after settlement; past that window the same identifiers report `expired` rather
 *  than being physically pruned immediately. A pending request without its own execution row (defensive: should
 *  not occur outside a data inconsistency) reports `funding_pending` rather than throwing. */
export class VerificationOperationsReader {
    constructor(
        private readonly requests: VerificationRequestStore,
        private readonly executions: VerificationExecutionStore,
        private readonly results: VerificationResultReader,
        private readonly clock: VerificationClock,
    ) {}

    async read(requestId: string, organizationId: string): Promise<ReadOutcome> {
        const request = await this.requests.findById(requestId, organizationId)
        if (!request) return { kind: 'not-found' }

        if (request.billingState === 'settled') {
            if (request.settledAt !== null) {
                const ageMs = this.clock.now().getTime() - request.settledAt.getTime()
                if (ageMs > REQUEST_VISIBILITY_WINDOW_MS) return { kind: 'expired' }
            }

            const result =
                request.resultId === null
                    ? null
                    : await this.results.findOwned({ id: request.resultId, organizationId })
            if (request.resultId !== null && result === null) return { kind: 'expired' }

            return {
                kind: 'settled',
                result,
                finalReason: request.finalReason,
                chargedCount: request.chargedCount,
            }
        }

        if (request.executionId === null) {
            return { kind: 'pending', executionState: 'funding_pending' }
        }

        const execution = await this.executions.findById(request.executionId, organizationId)
        if (!execution) return { kind: 'not-found' }
        return { kind: 'pending', executionState: execution.state }
    }
}
