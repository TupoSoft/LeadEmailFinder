import { IsInt, IsUUID, Min } from 'class-validator'
import { Expose } from 'class-transformer'

export class CreditsAccountParamsDto {
    @IsUUID()
    organizationId: string
}

export class AddCreditsDto {
    @IsInt()
    @Min(1)
    amount: number
}

export class SetBalanceDto {
    @IsInt()
    @Min(0)
    amount: number
}

export class CreditResponseDto {
    @Expose()
    balance: number
}
