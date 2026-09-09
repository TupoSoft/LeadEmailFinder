import {
    EnqueueBatchResponse,
    GetBatchStatusResponse,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { Expose } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { VERIFICATION_JOB_STATES, VerificationJobState } from '../../../application/delivery/verification-job-state'
import {
    BATCH_TERMINAL_FAILURE_CODES,
    BatchTerminalFailureCode,
} from '../../../application/delivery/batch/batch-terminal-failure'

export class UploadFileResponseDto implements EnqueueBatchResponse {
    @ApiProperty({ type: String, format: 'uuid' })
    @Expose()
    id: string
}

export class UploadFileRequestDto {
    @ApiProperty({
        type: String,
        format: 'binary',
        description: 'CSV file with an email header, media type text/csv, at most 104857600 bytes (100 megabytes).',
    })
    file: string
}

export class GetBatchStatusRequestParamsDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    id: string
}

export class GetBatchStatusResponseDto implements GetBatchStatusResponse {
    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    @Expose()
    id: string

    @ApiProperty({ type: String, enum: [...VERIFICATION_JOB_STATES] })
    @Expose()
    status: VerificationJobState

    @ApiPropertyOptional({
        type: String,
        enum: [...BATCH_TERMINAL_FAILURE_CODES],
        description:
            'Present only for failed jobs. processing_failed makes no claim about whether credits were charged.',
    })
    @Expose()
    failureCode?: BatchTerminalFailureCode

    @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
    @Expose()
    progress: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    total: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    processed: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    unprocessed: number
}
