import { KeyPermissions } from './key.enum'

export class GenerateKeyDto {
    permissions: KeyPermissions[] = [KeyPermissions.READ]
    description?: string
}
