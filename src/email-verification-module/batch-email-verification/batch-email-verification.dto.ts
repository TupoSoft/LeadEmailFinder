import {
    EnqueueBatchResponse,
    GetBatchStatusRequestParams,
    GetBatchStatusResponse,
} from './batch-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { JobState } from '../../common'

export class UploadFileResponseDto implements EnqueueBatchResponse {
    @Expose()
    id: string
}

export class UploadFileRequestDto {
    @ApiProperty({ format: 'text/csv' })
    file: string
}

export class GetBatchStatusRequestParamsDto implements GetBatchStatusRequestParams {
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
