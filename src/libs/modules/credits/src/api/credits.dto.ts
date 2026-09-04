import { IsInt, IsUUID, Min } from 'class-validator'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class CreditsAccountParamsDto {
    @ApiProperty({ type: String, format: 'uuid', description: 'Organization whose credit balance is managed' })
    @IsUUID()
    organizationId: string
}

export class AddCreditsDto {
    @ApiProperty({ type: 'integer', minimum: 1, description: 'Number of credits to add for this logical operation' })
    @IsInt()
    @Min(1)
    amount: number
}

export class SetBalanceDto {
    @ApiProperty({ type: 'integer', minimum: 0, description: 'Absolute credit balance' })
    @IsInt()
    @Min(0)
    amount: number
}

export class CreditResponseDto {
    @ApiProperty({ type: 'integer', minimum: 0, description: 'Current authoritative organization credit balance' })
    @Expose()
    balance: number
}
