import { Controller, Get } from '@nestjs/common'
import { AsyncEmailVerificationWorkerService } from './async-email-verification-worker.service'

@Controller()
export class AsyncEmailVerificationWorkerController {
    constructor(private readonly asyncEmailVerificationWorkerService: AsyncEmailVerificationWorkerService) {}

    @Get()
    getHello(): string {
        return this.asyncEmailVerificationWorkerService.getHello()
    }
}
