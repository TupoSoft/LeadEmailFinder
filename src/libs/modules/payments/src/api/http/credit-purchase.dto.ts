import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString } from 'class-validator'
import { PURCHASE_STATUSES, PurchaseStatus } from '../../domain/purchase-status'

export class CreateCreditPurchaseDto {
    @ApiProperty({ type: String, description: 'Identifier from the current credit pack catalog' })
    @IsString()
    @IsNotEmpty()
    packId: string
}

export class CreateCreditPurchaseResponseDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @Expose()
    id: string

    @ApiProperty({ type: String, enum: PURCHASE_STATUSES })
    @Expose()
    status: PurchaseStatus

    @ApiProperty({ type: String, format: 'uri', description: 'Validated hosted checkout URL' })
    @Expose()
    redirectUrl: string
}

export class CreditPurchaseResponseDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @Expose()
    id: string

    @ApiProperty({ type: String })
    @Expose()
    packId: string

    @ApiProperty({ type: 'integer', minimum: 1 })
    @Expose()
    credits: number

    @ApiProperty({ type: 'integer', minimum: 1, description: 'Price in the currency minor unit' })
    @Expose()
    amountMinor: number

    @ApiProperty({ type: String, pattern: '^[A-Z]{3}$' })
    @Expose()
    currency: string

    @ApiProperty({ type: String, enum: PURCHASE_STATUSES })
    @Expose()
    status: PurchaseStatus

    @ApiProperty({ type: String, format: 'date-time' })
    @Expose()
    createdAt: Date

    @ApiProperty({ type: String, format: 'date-time' })
    @Expose()
    updatedAt: Date
}
