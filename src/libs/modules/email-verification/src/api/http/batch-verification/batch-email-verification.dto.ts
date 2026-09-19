import {
    BatchStatusAddressCounts,
    BatchStatusBilling,
    EnqueueBatchResponse,
    GetBatchStatusResponse,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { Expose, Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { VERIFICATION_JOB_STATES, VerificationJobState } from '../../../application/delivery/verification-job-state'
import {
    BATCH_TERMINAL_FAILURE_CODES,
    BatchTerminalFailureCode,
} from '../../../application/delivery/batch/batch-terminal-failure'

export class BatchStatusAddressCountsDto implements BatchStatusAddressCounts {
    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    totalRows: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    uniqueAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    duplicateRows: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    cachedAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    sharedAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    cooldownAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    completedAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    conclusiveAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    inconclusiveAddresses: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    failedAddresses: number
}

export class BatchStatusBillingDto implements BatchStatusBilling {
    @ApiProperty({ type: String, enum: ['pending', 'settled'] })
    @Expose()
    state: 'pending' | 'settled'

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    reserved: number

    @ApiProperty({ type: Number, minimum: 0 })
    @Expose()
    charged: number
}

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

    @ApiProperty({
        type: Boolean,
        description:
            'True once settled row accounting is downloadable, including a terminal failure past validation whose output publication kept failing.',
    })
    @Expose()
    resultsAvailable: boolean

    @ApiProperty({ type: BatchStatusAddressCountsDto })
    @Expose()
    @Type(() => BatchStatusAddressCountsDto)
    counts: BatchStatusAddressCountsDto

    @ApiProperty({ type: BatchStatusBillingDto })
    @Expose()
    @Type(() => BatchStatusBillingDto)
    billing: BatchStatusBillingDto
}
