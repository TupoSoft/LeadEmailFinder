import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { ok } from 'node:assert'
import { BatchChildFlow, BatchChildFlowChild } from '../../../application/delivery/batch/batch-child-flow'
import { BatchJobData } from '../../../domain/batch-job'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { AsyncEmailVerificationJobData } from '../async-verification/async-email-verification-job-data.interface'

@Injectable()
export class BullBatchChildFlow implements BatchChildFlow {
    constructor(
        @InjectQueue(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
        private readonly batchQueue: Queue<BatchJobData, string>,
        @InjectQueue('async-email-verification')
        private readonly asyncEmailVerificationQueue: Queue<AsyncEmailVerificationJobData>,
    ) {}

    async dispatchChild(
        parent: { id: string; queueQualifiedName: string },
        child: BatchChildFlowChild,
    ): Promise<void> {
        await this.asyncEmailVerificationQueue.add(
            'async-email-verification',
            { email: child.email, batchId: parent.id, organizationId: child.organizationId, credentialId: child.credentialId },
            {
                jobId: randomUUID(),
                parent: {
                    id: parent.id,
                    queue: parent.queueQualifiedName,
                },
            },
        )
    }

    async awaitChildren(jobId: string, token: string): Promise<{ shouldWait: boolean }> {
        const job = await this.batchQueue.getJob(jobId)

        ok(job, `Job with id "${jobId}" not found.`)

        const shouldWait = await job.moveToWaitingChildren(token)

        return { shouldWait }
    }
}
