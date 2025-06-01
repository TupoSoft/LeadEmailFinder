import { EnqueueBatchResponse } from './batch-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class UploadFileResponseDto implements EnqueueBatchResponse {
    @Expose()
    id: string
}

export class UploadFileRequestDto {
    @ApiProperty({ format: 'text/csv' })
    file: string
}
