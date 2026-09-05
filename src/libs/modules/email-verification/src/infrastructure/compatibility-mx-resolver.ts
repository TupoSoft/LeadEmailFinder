import { IDnsService } from '@tuposoft/lead-email-finder/common'
import { MxResolver } from '../application/ports/mx-resolver'

/** Wraps the existing DNS MX lookup unchanged; module-architecture/13 replaces this with a real adapter. */
export class CompatibilityMxResolver implements MxResolver {
    constructor(private readonly dnsService: IDnsService) {}

    async resolve(domain: string): Promise<string[]> {
        const records = await this.dnsService.resolve(domain, 'MX')
        return records.map(({ exchange }) => exchange)
    }
}
