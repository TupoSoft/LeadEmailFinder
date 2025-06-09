import { KeyPermissions } from './key.enum'
import { Expose, Transform } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'

export class GenerateKeyDto {
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    permissions: KeyPermissions[] = [KeyPermissions.USER]

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
    @Transform(({ obj }: { obj: { userId: { toString(): string } } }) => obj.userId?.toString())
    userId: string

    @Expose()
    description?: string

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class RevokeKeyDto {
    @IsString()
    token: string
}
