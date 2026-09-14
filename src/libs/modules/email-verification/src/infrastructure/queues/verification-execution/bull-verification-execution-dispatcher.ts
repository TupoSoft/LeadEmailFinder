import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { VerificationExecutionDispatcher } from '../../../application/ports/verification-execution-dispatcher'
import {
    VERIFICATION_EXECUTION_JOB_NAME,
    VERIFICATION_EXECUTION_PAYLOAD_VERSION,
    VERIFICATION_EXECUTION_QUEUE_NAME,
    VerificationExecutionJobData,
} from './verification-execution-queue.config'

@Injectable()
export class BullVerificationExecutionDispatcher implements VerificationExecutionDispatcher {
    constructor(
        @InjectQueue(VERIFICATION_EXECUTION_QUEUE_NAME)
        private readonly queue: Queue<VerificationExecutionJobData>,
    ) {}

    async dispatch(executionId: string, organizationId: string): Promise<void> {
        await this.queue.add(
            VERIFICATION_EXECUTION_JOB_NAME,
            { v: VERIFICATION_EXECUTION_PAYLOAD_VERSION, executionId, organizationId },
            { jobId: executionId },
        )
    }
}
