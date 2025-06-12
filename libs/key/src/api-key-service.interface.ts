import { KeyPermissions } from './key.enum'
import { Observable } from 'rxjs'

export interface ApiKeyService {
    validateKeyForRoles(request: {
        token: string
        requiredPermissions: KeyPermissions[]
    }): Observable<{ value: boolean }>
}
