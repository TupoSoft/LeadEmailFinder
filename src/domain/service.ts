import type { DomainRepository } from './repository'
import type { Domain } from './dto'


export class DomainService {
    constructor(private readonly domainRepository: DomainRepository) {}
  
    async create(domain: Domain): Promise<void> {
        await this.domainRepository.save(domain)
    }

    async get(name: string): Promise<Domain> {
        return await this.domainRepository.findByName(name)
    }

    /**
     * Fetches the homepage, extracts emails,
     * looks for 'Contact'/'Privacy' links and fetches them,
     * extracts emails from those pages, and returns all unique emails.
     */
    public async findSynonymDomains(domain: string): Promise<string[]> {
        const foundEmails = new Set<string>();

        const homepageHTML = await this.fetchHTML(domain);
        if (!homepageHTML) {
            throw new Error(`No website found or failed to fetch domain: ${domain}`);
        }

        this.extractEmails(homepageHTML, foundEmails);

        const relevantLinks = await this.findRelevantLinks(homepageHTML, domain);

        for (const link of relevantLinks) {
            const pageHTML = await this.fetchHTML(link);
            if (pageHTML) {
                this.extractEmails(pageHTML, foundEmails);
            }
        }

        return Array.from(foundEmails);
    }
  
    private async fetchHTML(url: string): Promise<string | null> {
        try {
            const { default: axios } = await import('axios');
            const response = await axios.get(url);
            if (response.status < 200 || response.status >= 300) {
               return null;
            }

            return response.data;
        } catch (error) {
            return null;
        }
    }
      
  
    private extractEmails(html: string, emailSet: Set<string>): void {
        const emailRegex = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/gi;
        const matches = html.match(emailRegex);
        if (matches) {
            for (const email of matches) {
                emailSet.add(email);
            }   
        }
    }
  
    private async findRelevantLinks(html: string, baseUrl: string): Promise<string[]> {
        const cheerio = await import('cheerio');
        const $ = cheerio.load(html);

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
