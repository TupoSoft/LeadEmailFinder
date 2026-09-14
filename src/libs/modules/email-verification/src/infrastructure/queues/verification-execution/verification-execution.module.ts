import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VERIFICATION_EXECUTION_DISPATCHER } from '../../../application/ports/verification-execution-dispatcher'
import { BullVerificationExecutionDispatcher } from './bull-verification-execution-dispatcher'
import { VerificationExecutionProcessor } from './verification-execution.processor'
import { VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS, VERIFICATION_EXECUTION_QUEUE_NAME } from './verification-execution-queue.config'

@Module({
    imports: [
        EmailVerificationCoreModule,
        BullModule.registerQueue({
            name: VERIFICATION_EXECUTION_QUEUE_NAME,
            defaultJobOptions: VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS,
        }),
    ],
    providers: [
        BullVerificationExecutionDispatcher,
        VerificationExecutionProcessor,
        { provide: VERIFICATION_EXECUTION_DISPATCHER, useExisting: BullVerificationExecutionDispatcher },
    ],
    exports: [VERIFICATION_EXECUTION_DISPATCHER],
})
export class VerificationExecutionModule {}
