import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { VerificationFinalReason, VerificationRequestSource } from '../application/ports/verification-request-store'

const VERIFICATION_REQUEST_SOURCES: readonly VerificationRequestSource[] = ['fresh', 'cache', 'shared']
const VERIFICATION_FINAL_REASONS: readonly VerificationFinalReason[] = [
    'conclusive',
    'cached',
    'shared',
    'inconclusive',
    'failed',
]

/** Decorated shape only — `buildOperationMetadata` in `application/operations/verification-operation-metadata.ts`
 *  computes the plain value; `@SerializeOptions({type: ...})` coerces it into these classes for serialization. */
export class VerificationOperationBillingDto {
    @ApiProperty({ enum: ['pending', 'settled'] })
    @Expose()
    state: 'pending' | 'settled'

    @ApiProperty({ enum: [0, 1] })
    @Expose()
    reserved: 0 | 1

    @ApiProperty({ enum: [0, 1] })
    @Expose()
    charged: 0 | 1

    @ApiPropertyOptional({ enum: VERIFICATION_FINAL_REASONS })
    @Expose()
    reason?: VerificationFinalReason
}

export class VerificationOperationMetadataDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @Expose()
    id: string

    @ApiProperty({ enum: VERIFICATION_REQUEST_SOURCES })
    @Expose()
    source: VerificationRequestSource

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    @Expose()
    observedAt: string | null

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    @Expose()
    cacheExpiresAt: string | null

    @ApiProperty({ type: VerificationOperationBillingDto })
    @Expose()
    @Type(() => VerificationOperationBillingDto)
    billing: VerificationOperationBillingDto
}
