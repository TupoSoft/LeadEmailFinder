export interface IDomainSynonymFinder {
    findSynonymDomains: (domain: string) => Promise<string[]>
}
