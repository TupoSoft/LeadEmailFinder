import { KeyPermissions } from './key.enum'

export interface ValidateKeyForRolesRequest {
    token: string
    requiredPermissions: KeyPermissions[]
}

export interface ApiKeyService {
    validateKeyForRoles(request: ValidateKeyForRolesRequest): Promise<boolean>
}
