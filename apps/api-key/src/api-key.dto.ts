import { KeyPermissions } from '@tuposoft/lead-email-finder/key/key.enum'
import { Expose, Transform } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'

export class GenerateKeyDto {
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    permissions: KeyPermissions[] = [KeyPermissions.READ]

    @IsOptional()
    @IsString()
    description?: string
}

export class ApiKeyResponseDto {
    @Expose()
    token: string

    @Expose()
    permissions: KeyPermissions[]

    @Expose()
    @Transform(({ obj }: { obj: { _id: { toString(): string } } }) => obj._id.toString())
    id: string

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class ValidateKeyForRolesDto {
    @IsString()
    token: string

    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    requiredPermissions: KeyPermissions[]
}
