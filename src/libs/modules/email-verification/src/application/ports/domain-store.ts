import { DomainPolicy } from '../../domain/domain-policy'

export const DOMAIN_STORE = Symbol('DOMAIN_STORE')

export interface DomainStore {
    findByName(name: string): Promise<DomainPolicy | null>
}
