import { AuthRole } from '../../domain/auth-principal'

export const CURRENT_ACCOUNT_READER = Symbol('CURRENT_ACCOUNT_READER')

export interface CurrentAccountReadInput {
    readonly externalIdentityId: string
    readonly organizationId: string
}

export interface CurrentAccountRecord {
    readonly email: string | null
    readonly membership: {
        readonly id: string
        readonly role: AuthRole
    }
    readonly organization: {
        readonly id: string
        readonly name: string
    }
}

/**
 * Reads browser-safe account fields for one authenticated human identity. Returns `undefined` unless the identity has
 * exactly one active membership and that membership belongs to the expected organization.
 */
export interface CurrentAccountReader {
    read(input: CurrentAccountReadInput): Promise<CurrentAccountRecord | undefined>
}
