import {
    EnqueueBatchResponse,
    GetBatchStatusResponse,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { JobState } from '@tuposoft/lead-email-finder/common'

export class UploadFileResponseDto implements EnqueueBatchResponse {
    @Expose()
    id: string
}

export class UploadFileRequestDto {
    @ApiProperty({ format: 'text/csv' })
    file: string
}

export class GetBatchStatusRequestParamsDto {
    @IsUUID()
    id: string
}

export class GetBatchStatusResponseDto implements GetBatchStatusResponse {
    @IsUUID()
    @Expose()
    id: string

    @Expose()
    status: JobState

    @Expose()
    progress: number

    @Expose()
    total: number

    @Expose()
    processed: number

    @Expose()
    unprocessed: number
}
