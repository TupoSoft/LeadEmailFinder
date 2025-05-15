import { KeyRole } from './key.schema'

export class GenerateKeyDto {
    permissions: KeyRole[] = [KeyRole.READ]
    description?: string
}
