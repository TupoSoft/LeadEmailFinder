import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { BullBatchChildFlow } from './bull-batch-child-flow'

describe('BullBatchChildFlow', () => {
    let asyncQueue: { add: jest.Mock }
    let batchQueue: { getJob: jest.Mock }
    let childFlow: BullBatchChildFlow

    beforeEach(async () => {
        asyncQueue = { add: jest.fn() }
        batchQueue = { getJob: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BullBatchChildFlow,
                { provide: getQueueToken(BATCH_EMAIL_VERIFICATION_QUEUE_NAME), useValue: batchQueue },
                { provide: getQueueToken('async-email-verification'), useValue: asyncQueue },
            ],
        }).compile()

        childFlow = module.get(BullBatchChildFlow)
    })

    it('propagates the parent organization and batch id to the dispatched child job', async () => {
        await childFlow.dispatchChild(
            { id: 'job-1', queueQualifiedName: 'bull:batch-email-verification' },
            { email: 'person@lef.test', organizationId: 'org-1', credentialId: 'cred-1' },
        )

        expect(asyncQueue.add).toHaveBeenCalledWith(
            'async-email-verification',
            { email: 'person@lef.test', batchId: 'job-1', organizationId: 'org-1', credentialId: 'cred-1' },
            {
                jobId: expect.any(String),
                parent: { id: 'job-1', queue: 'bull:batch-email-verification' },
            },
        )
    })

    it('classifies child queue failures by preserving the original error', async () => {
        const error = new Error('private queue diagnostic')
        asyncQueue.add.mockRejectedValue(error)

        await expect(
            childFlow.dispatchChild(
                { id: 'job-1', queueQualifiedName: 'bull:batch-email-verification' },
                { email: 'person@lef.test', organizationId: 'org-1', credentialId: 'cred-1' },
            ),
        ).rejects.toBe(error)
    })

    it('delegates awaitChildren to moveToWaitingChildren on the exact job', async () => {
        const moveToWaitingChildren = jest.fn().mockResolvedValue(true)
        batchQueue.getJob.mockResolvedValue({ moveToWaitingChildren })

        const result = await childFlow.awaitChildren('job-1', 'token')

        expect(result).toEqual({ shouldWait: true })
        expect(moveToWaitingChildren).toHaveBeenCalledWith('token')
    })

    it('reports children complete once moveToWaitingChildren resolves false', async () => {
        const moveToWaitingChildren = jest.fn().mockResolvedValue(false)
        batchQueue.getJob.mockResolvedValue({ moveToWaitingChildren })

        const result = await childFlow.awaitChildren('job-1', 'token')

        expect(result).toEqual({ shouldWait: false })
    })
})
