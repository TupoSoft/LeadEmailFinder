// import { Injectable } from '@nestjs/common'
// import { InjectQueue } from '@nestjs/bullmq'
// import { Queue } from 'bullmq'
// import { IEmailVerificationResponseDto } from '../../common'
// import { randomUUID } from 'node:crypto'
// import { VerifyAsyncResponse } from './verify-async-response.interface'
// import { GetAsyncVerificationStatus } from './get-async-verification-status.interface'
// import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
// import { AsyncEmailVerificationService } from './async-email-verification-service.interface'

// @Injectable()
// export class AsyncEmailVerificationServiceImpl implements AsyncEmailVerificationService {
// constructor(
// @InjectQueue('async-email-verification')
// private readonly queue: Queue<string, IEmailVerificationResponseDto, 'async-email-verification'>,
// ) {}
//
// async verifyAsync(email: string): Promise<VerifyAsyncResponse> {
// const { id } = await this.queue.add('async-email-verification', email, { jobId: randomUUID() })
// return { id }
// }
//
// async getAsyncVerificationState(id: string): Promise<GetAsyncVerificationStatus> {
// const job = await this.queue.getJob(id)
//
// if (job === undefined) {
// throw new AsyncEmailVerificationJobNotFoundException()
// }
//
// const state = await job.getState()
//
// if (state !== 'completed') {
// return {
// state,
// }
// }
//
// const { returnvalue: result } = job
//
// return {
// state,
// result,
// }
// }
// }
