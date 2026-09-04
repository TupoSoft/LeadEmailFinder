export const DOMAIN_SYNONYM_DISCOVERY = Symbol('DOMAIN_SYNONYM_DISCOVERY')

export interface DomainSynonymDiscovery {
    findSynonymDomains(domain: string): Promise<string[]>
}
