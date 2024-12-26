import { load } from 'cheerio'

export function extractDomains(html: string): string[] {
    const emailRegex = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi;
    const matches = html.matchAll(emailRegex);

    const domains: string[] = [];
    for (const match of matches) {
        const [, domain] = match
        if (domain !== "") {
            domains.push(domain.toLowerCase());
        }
    }
    return domains;
}

export function findRelevantLinks(html: string, baseUrl: string): string[] {
    const $ = load(html);

    const links = $('a')
        .filter((_i, el) => {
            const text = $(el).text().toLowerCase();
            return text.includes('contact') || text.includes('privacy');
        })
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href: string | undefined): href is string => !(href == null));

    const base = new URL(baseUrl);
    const absoluteLinks = links.map(link => new URL(link, base).toString());

    return Array.from(new Set(absoluteLinks));
}
