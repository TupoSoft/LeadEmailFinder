import {
    EnqueueBatchResponse,
    GetBatchStatusRequestParams,
    GetBatchStatusResponse,
} from './batch-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { JobState } from './job-state.enum'

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
    id: string

    progress: number

    status: JobState
}
