import { Module } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VERIFICATION_EXECUTION_DISPATCHER } from '../../../application/ports/verification-execution-dispatcher'
import { TypeOrmVerificationQueueStore } from '../../persistence/typeorm-verification-queue.store'
import { CloudflareVerificationQueues } from './cloudflare-verification-queues'

@Module({
    imports: [EmailVerificationCoreModule, ConfigModule],
    providers: [
        {
            provide: TypeOrmVerificationQueueStore,
            inject: [DataSource],
            useFactory: (source: DataSource) => new TypeOrmVerificationQueueStore(source),
        },
        CloudflareVerificationQueues,
        { provide: VERIFICATION_EXECUTION_DISPATCHER, useExisting: TypeOrmVerificationQueueStore },
    ],
    exports: [VERIFICATION_EXECUTION_DISPATCHER],
})
export class VerificationExecutionModule {}
