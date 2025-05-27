import { KeyPermissions } from './key.enum'
import { Expose } from 'class-transformer'

export class GenerateKeyDto {
    permissions: KeyPermissions[] = [KeyPermissions.READ]
    description?: string
}

export class ApiKeyResponseDto {
    @Expose()
    token: string

    @Expose()
    permissions: KeyPermissions[]

    @Expose()
    _id: string

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}
