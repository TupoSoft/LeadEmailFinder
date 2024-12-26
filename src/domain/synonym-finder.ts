import type { HttpClient } from '../http-client'
import { extractDomains, findRelevantLinks } from './util'

export interface SynonymFinder {
    findSynonymDomains: (domain: string) => Promise<string[]>
}

export class HTMLSynonymFinder implements SynonymFinder {
    constructor(private readonly httpClient: HttpClient) {}

    public async findSynonymDomains(domain: string): Promise<string[]> {
        const foundDomains = new Set<string>()

        const homepageHTML = await this.fetchHTML(domain)
        if (homepageHTML == null) {
            throw new Error(`No website found or failed to fetch domain: ${domain}`)
        }

        const domainsFromHome = extractDomains(homepageHTML)
        domainsFromHome.forEach(d => foundDomains.add(d))

        const relevantLinks = findRelevantLinks(homepageHTML, domain)

        const fetchPromises = relevantLinks.map(async (link) => {
            const pageHTML = await this.fetchHTML(link)
            if (pageHTML != null) {
                return extractDomains(pageHTML)
            }
            return []
        })

        const results = await Promise.all(fetchPromises)
        results.flat().forEach(d => foundDomains.add(d))

        return Array.from(foundDomains)
    }

    private async fetchHTML(url: string): Promise<string | null> {
        try {
            return await this.httpClient.get<string>(url)
        } catch (error) {
            return null
        }
    }
}
