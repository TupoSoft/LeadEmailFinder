import { getQueueToken } from '@nestjs/bullmq'
import { Test } from '@nestjs/testing'
import { BullVerificationExecutionDispatcher } from './bull-verification-execution-dispatcher'
import { VERIFICATION_EXECUTION_JOB_NAME, VERIFICATION_EXECUTION_QUEUE_NAME } from './verification-execution-queue.config'

describe('BullVerificationExecutionDispatcher', () => {
    it('enqueues one versioned job keyed by execution ID', async () => {
        const queue = { add: jest.fn() }
        const moduleRef = await Test.createTestingModule({
            providers: [
                BullVerificationExecutionDispatcher,
                { provide: getQueueToken(VERIFICATION_EXECUTION_QUEUE_NAME), useValue: queue },
            ],
        }).compile()
        const dispatcher = moduleRef.get(BullVerificationExecutionDispatcher)

        await dispatcher.dispatch('execution-1', 'org-1')

        expect(queue.add).toHaveBeenCalledWith(
            VERIFICATION_EXECUTION_JOB_NAME,
            { v: 1, executionId: 'execution-1', organizationId: 'org-1' },
            { jobId: 'execution-1' },
        )
    })
})
