import type { HttpClient } from '../http-client'
import { extractDomains, findRelevantLinks } from './util'

export interface SynonymFinder {
    findSynonymDomains: (domain: string) => Promise<string[]>
}

export class HTMLSynonymFinder implements SynonymFinder {
    constructor(private readonly httpClient: HttpClient) {}

    public async findSynonymDomains(domain: string): Promise<string[]> {
        const foundDomains = new Set<string>()

        const homepageHTML = await this.httpClient.get<string>(domain)
        if (homepageHTML === '') {
            throw new Error(`No website found or failed to fetch domain: ${domain}`)
        }

        const domainsFromHome = extractDomains(homepageHTML)
        domainsFromHome.forEach(d => foundDomains.add(d))

        const relevantLinks = findRelevantLinks(homepageHTML, domain)

        const fetchPromises = relevantLinks.map(async link =>
            await this.httpClient.get<string>(link).then(
                pageHTML => extractDomains(pageHTML)
            )
        )

        const results = await Promise.allSettled(fetchPromises)
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                result.value.forEach(d => foundDomains.add(d))
            }
        })

        return Array.from(foundDomains)
    }
}
