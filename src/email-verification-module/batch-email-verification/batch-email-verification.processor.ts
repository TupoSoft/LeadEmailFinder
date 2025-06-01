import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job, WaitingChildrenError } from 'bullmq'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'

@Processor('batch-email-verification')
export class BatchEmailVerificationProcessor extends WorkerHost {
    async process(job: Job<BatchEmailVerificationJobData>, token: string): Promise<any> {
        switch (job.data.step) {
            case BatchEmailVerificationJobStep.WaitForChildren:
                await this.waitForChildren(job, token)
                break
            case BatchEmailVerificationJobStep.Process:
                break
            default:
                this.handleDefault(job)
        }
    }

    private async waitForChildren(job: Job<BatchEmailVerificationJobData>, token: string): Promise<void> {
        await job.moveToWaitingChildren(token)
        throw new WaitingChildrenError()
    }

    private handleDefault(job: Job<BatchEmailVerificationJobData>): never {
        throw new Error(`Unknown step: ${String(job.data.step)}`)
    }
}
