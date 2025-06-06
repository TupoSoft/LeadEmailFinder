import { Module } from '@nestjs/common';
import { AsyncEmailVerificationWorkerController } from './async-email-verification-worker.controller';
import { AsyncEmailVerificationWorkerService } from './async-email-verification-worker.service';

@Module({
  imports: [],
  controllers: [AsyncEmailVerificationWorkerController],
  providers: [AsyncEmailVerificationWorkerService],
})
export class AsyncEmailVerificationWorkerModule {}
