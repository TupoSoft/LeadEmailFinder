import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString } from 'class-validator'
import { CreditPurchaseStatus } from './credit-purchase.entity'

export class CreateCreditPurchaseDto {
    @IsString()
    @IsNotEmpty()
    packId: string
}

export class CreateCreditPurchaseResponseDto {
    @Expose()
    id: string

    @Expose()
    status: CreditPurchaseStatus

    @Expose()
    redirectUrl: string
}

export class CreditPurchaseResponseDto {
    @Expose()
    id: string

    @Expose()
    packId: string

    @Expose()
    credits: number

    @Expose()
    amountMinor: number

    @Expose()
    currency: string

    @Expose()
    provider: string

    @Expose()
    providerReference?: string | null

    @Expose()
    status: CreditPurchaseStatus

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}
