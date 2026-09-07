import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'

export class BillingCreditPackResponseDto {
    @ApiProperty({ type: String, description: 'Server-defined credit pack identifier' })
    @Expose()
    readonly id: string

    @ApiProperty({ type: 'integer', minimum: 1, description: 'Credits granted after confirmed payment' })
    @Expose()
    readonly credits: number

    @ApiProperty({ type: 'integer', minimum: 1, description: 'Price in the currency minor unit' })
    @Expose()
    readonly amountMinor: number

    @ApiProperty({ type: String, pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency code' })
    @Expose()
    readonly currency: string
}
