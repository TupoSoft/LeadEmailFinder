import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReadSource,
    EmailVerificationReason,
    EmailVerificationSource,
} from '@tuposoft/lead-email-finder/common'
import { IsUUID } from 'class-validator'
import { IsVerifiableEmail } from '../synchronous-verification/is-verifiable-email.decorator'
import {
    AsyncVerificationResult,
    AsyncVerificationStatus,
} from '../../../application/delivery/async/async-verification-status'
import { VerificationOperationMetadataDto } from '../../verification-operation-metadata.dto'

export class VerifyAsyncRequestBodyDto {
    @ApiProperty({ type: String, format: 'email', example: 'person@lef.test' })
    @IsVerifiableEmail()
    email: string
}

export class VerifyAsyncResponseDto {
    @ApiProperty({ type: String, format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
    @Expose()
    @IsUUID()
    id: string
}

export class GetAsyncVerificationStatusRequestParamsDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    id: string
}

export class AsyncVerificationResultDto implements AsyncVerificationResult {
    @ApiProperty({ type: String, format: 'uuid', example: '00000000-0000-4000-8000-000000000002' })
    @Expose()
    id: string

    @ApiProperty({ type: String, format: 'email', example: 'person@lef.test' })
    @Expose()
    email: string

    @ApiProperty({ type: String, example: 'person' })
    @Expose()
    localPart: string

    @ApiProperty({ type: String, example: 'lef.test' })
    @Expose()
    domain: string

    @ApiPropertyOptional({ enum: EmailPatternEnum })
    @Expose()
    format?: EmailPatternEnum

    @ApiProperty({ type: Boolean, nullable: true, example: true })
    @Expose()
    exists: boolean | null

    @ApiProperty({ type: Boolean, nullable: true, example: null })
    @Expose()
    catchAll: boolean | null

    @ApiProperty({ enum: EmailVerificationReason, example: EmailVerificationReason.AcceptedEmail })
    @Expose()
    reason: EmailVerificationReason

    @ApiProperty({ enum: [...Object.values(EmailVerificationSource), 'linkedin'], isArray: true, example: ['mx'] })
    @Expose()
    sources: EmailVerificationReadSource[]

    @ApiPropertyOptional({ type: String, example: 'lef.test' })
    @Expose()
    mxDomain?: string

    @ApiPropertyOptional({ type: String, example: 'mx.lef.test' })
    @Expose()
    targetExchange?: string
}

/** Runtime serialization is deliberately independent of the Swagger union variants. */
export class GetAsyncVerificationStatusResponseDto {
    @Expose()
    state: AsyncVerificationStatus['state']

    @Expose()
    @Type(() => AsyncVerificationResultDto)
    result?: AsyncVerificationResultDto

    @Expose()
    failureCode?: 'verification_failed'

    @Expose()
    @Type(() => VerificationOperationMetadataDto)
    operation?: VerificationOperationMetadataDto
}

export class AsyncVerificationQueuedResponseDto {
    @ApiProperty({ type: String, enum: ['queued'] })
    state: 'queued'
}

export class AsyncVerificationRunningResponseDto {
    @ApiProperty({ type: String, enum: ['running'] })
    state: 'running'
}

export class AsyncVerificationCompletedResponseDto {
    @ApiProperty({ type: String, enum: ['completed'] })
    state: 'completed'

    @ApiProperty({ type: AsyncVerificationResultDto })
    result: AsyncVerificationResultDto

    @ApiProperty({ type: VerificationOperationMetadataDto })
    operation: VerificationOperationMetadataDto
}

export class AsyncVerificationFailedResponseDto {
    @ApiProperty({ type: String, enum: ['failed'] })
    state: 'failed'

    @ApiProperty({ type: String, enum: ['verification_failed'] })
    failureCode: 'verification_failed'

    @ApiProperty({ type: VerificationOperationMetadataDto })
    operation: VerificationOperationMetadataDto
}

export class AsyncVerificationUnavailableResponseDto {
    @ApiProperty({ type: String, enum: ['unavailable'] })
    state: 'unavailable'
}
