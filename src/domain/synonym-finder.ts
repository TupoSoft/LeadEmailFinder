import { load } from 'cheerio';
import type { HttpClient } from '../http-client';

export interface SynonymFinder {
    findSynonymDomains: (domain: string) => Promise<string[]>;
}

export class HTMLSynonymFinder implements SynonymFinder {
    constructor(private readonly httpClient: HttpClient) {}

    public async findSynonymDomains(domain: string): Promise<string[]> {
        const foundDomains = new Set<string>();

        const homepageHTML = await this.fetchHTML(domain);
        if (!homepageHTML) {
            throw new Error(`No website found or failed to fetch domain: ${domain}`);
        }

        this.extractDomains(homepageHTML, foundDomains);

        const relevantLinks = await this.findRelevantLinks(homepageHTML, domain);

        for (const link of relevantLinks) {
            const pageHTML = await this.fetchHTML(link);
            if (pageHTML) {
                this.extractDomains(pageHTML, foundDomains);
            }
        }

        return Array.from(foundDomains);
    }

    private async fetchHTML(url: string): Promise<string | null> {
        try {
            const data = await this.httpClient.get<string>(url);
            return data;
        } catch (error) {
            return null;
        }
    }

    private extractDomains(html: string, domainSet: Set<string>): void {
        const emailRegex = /[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi;
        const matches = html.matchAll(emailRegex);

        for (const match of matches) {
            if (match[1]) {
                domainSet.add(match[1].toLowerCase());
            }
        }
    }

    private async findRelevantLinks(html: string, baseUrl: string): Promise<string[]> {
        const $ = load(html);

        const links = $('a')
            .filter((_i, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('contact') || text.includes('privacy');
            })
            .map((_i, el) => $(el).attr('href'))
            .get()
            .filter((href: string | undefined): href is string => !!href);

        const base = new URL(baseUrl);
        const absoluteLinks = links.map(link => new URL(link, base).toString());

        return Array.from(new Set(absoluteLinks));
    }
}
