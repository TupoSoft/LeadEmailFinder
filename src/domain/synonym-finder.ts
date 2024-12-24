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

        extractDomains(homepageHTML, foundDomains)

        const relevantLinks = await findRelevantLinks(homepageHTML, domain)

        for (const link of relevantLinks) {
            const pageHTML = await this.fetchHTML(link)
            if (pageHTML != null) {
                extractDomains(pageHTML, foundDomains)
            }
        }

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
