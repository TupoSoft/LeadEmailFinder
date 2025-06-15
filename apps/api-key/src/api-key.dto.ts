import { KeyPermissions } from '@tuposoft/lead-email-finder/key/key.enum'
import { Expose, Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator'

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
    @Transform(({ obj }: { obj: { _id: { toString(): string } } }) => obj._id.toString(), { toClassOnly: true })
    id: string

    @Expose()
    token: string

    @Expose()
    description?: string

    @Expose()
    permissions: KeyPermissions[]

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

    @IsOptional()
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    requiredPermissions: KeyPermissions[]
}

export class BoolValueDto {
    @Expose()
    @IsBoolean()
    value: boolean
}
