import { Module } from '@nestjs/common'
import { VERIFICATION_TRACE_OBSERVER } from '../../application/verification-trace/verification-trace-observer'
import { LoggingVerificationTraceObserver } from './logging-verification-trace-observer'

@Module({
    providers: [{ provide: VERIFICATION_TRACE_OBSERVER, useClass: LoggingVerificationTraceObserver }],
    exports: [VERIFICATION_TRACE_OBSERVER],
})
export class VerificationTraceModule {}
