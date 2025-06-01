import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { randomUUID } from 'node:crypto'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { ok } from 'node:assert'
import { BatchEmailVerificationFile } from './file.interface'
import { parse } from 'csv-parse'
import { plainToInstance } from 'class-transformer'
import { BatchEmailVerificationCsvRowDto } from './batch-email-verification-csv-row.dto'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationService, EnqueueBatchResponse } from './batch-email-verification-service.interface'
import { Readable } from 'node:stream'

@Injectable()
export class BatchEmailVerificationServiceImpl implements BatchEmailVerificationService {
    constructor(
        @InjectQueue('batch-email-verification')
        private readonly batchEmailVerificationQueue: Queue<BatchEmailVerificationJobData>,
        @InjectQueue('async-email-verification') private readonly asyncEmailVerificationQueue: Queue<string>,
    ) {}

    async enqueueBatch({ buffer }: BatchEmailVerificationFile): Promise<EnqueueBatchResponse> {
        const batchEmailVerificationJob = await this.batchEmailVerificationQueue.add(
            'batch-email-verification',
            {
                step: BatchEmailVerificationJobStep.WaitForChildren,
            },
            { jobId: randomUUID() },
        )

        const { id, queueQualifiedName: queue } = batchEmailVerificationJob

        ok(id, 'Failed to add job to queue. Job ID is undefined. Queue name: batch-email-verification.')

        const parser = Readable.from(buffer).pipe(
            parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
            }),
        )

        for await (const row of parser) {
            const { email } = plainToInstance(BatchEmailVerificationCsvRowDto, row)

            await this.asyncEmailVerificationQueue.add('async-email-verification', email, {
                jobId: randomUUID(),
                parent: { id, queue },
            })
        }

        await batchEmailVerificationJob.updateData({
            step: BatchEmailVerificationJobStep.Process,
        })

        return {
            id,
        }
    }
}
