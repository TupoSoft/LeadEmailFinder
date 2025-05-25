import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@Injectable()
export class AsyncEmailVerificationService {
    constructor(@InjectQueue('email-verification') private readonly queue: Queue) {}
}
