import { extractDomains, findRelevantLinks } from './domain.util'
import { IDomainSynonymFinder, safeErrorType } from '@tuposoft/lead-email-finder/common'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { isNativeError } from 'node:util/types'

@Injectable()
export class HTMLDomainSynonymFinder implements IDomainSynonymFinder {
    @Inject(Logger)
    @Optional()
    private readonly logger = new Logger(HTMLDomainSynonymFinder.name)

    constructor(private readonly httpService: HttpService) {}

    public async findSynonymDomains(domain: string): Promise<string[]> {
        try {
            const foundDomains = new Set<string>()

            const { data: homepageHTML } = await firstValueFrom(this.httpService.get<string>(domain))

            const domainsFromHome = extractDomains(homepageHTML)
            domainsFromHome.forEach(d => foundDomains.add(d))

            const relevantLinks = findRelevantLinks(homepageHTML, domain)

            const fetchPromises = relevantLinks.map(
                async link =>
                    await firstValueFrom(this.httpService.get<string>(link)).then(({ data: pageHTML }) =>
                        extractDomains(pageHTML),
                    ),
            )

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
}
