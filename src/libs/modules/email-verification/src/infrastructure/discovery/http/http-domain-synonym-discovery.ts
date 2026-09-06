import { extractDomains, findRelevantLinks } from '../../../domain/domain-synonym-parser'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { isNativeError } from 'node:util/types'
import { DomainSynonymDiscovery } from '../../../application/ports/domain-synonym-discovery'

/** Retrieves homepage and relevant pages through the configured HTTP transport. */
@Injectable()
export class HttpDomainSynonymDiscovery implements DomainSynonymDiscovery {
    @Inject(Logger)
    @Optional()
    private readonly logger = new Logger(HttpDomainSynonymDiscovery.name)

    constructor(private readonly httpService: HttpService) {}

    public async findSynonymDomains(domain: string): Promise<string[]> {
        try {
            const foundDomains = new Set<string>()

            const homepageHTML = await this.fetchPage(domain)

            const domainsFromHome = extractDomains(homepageHTML)
            domainsFromHome.forEach(d => foundDomains.add(d))

            const relevantLinks = findRelevantLinks(homepageHTML, domain)

            const fetchPromises = relevantLinks.map(async link => extractDomains(await this.fetchPage(link)))

            const results = await Promise.allSettled(fetchPromises)
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    result.value.forEach(d => foundDomains.add(d))
                }
            })

            return Array.from(foundDomains)
        } catch (error) {
            if (isNativeError(error)) {
                this.logger.error('domain_synonym_fetch_failed', {
                    errorClass: safeErrorType(error),
                })
            }

            return []
        }
    }

    private async fetchPage(url: string): Promise<string> {
        // Keep the injected transport's deadline and retry policy. This adapter adds no retries
        // or recursive traversal, and each unique contact/privacy link is requested only once.
        const { data } = await firstValueFrom(this.httpService.get<unknown>(url))
        if (typeof data !== 'string') {
            throw new Error('domain_synonym_content_invalid')
        }
        return data
    }
}
