import { IDnsService } from '@tuposoft/lead-email-finder/common'
import { MxResolver } from '../../../application/ports/mx-resolver'

/** Projects the DNS library's ordered, cached MX records into the application port. */
export class DnsMxResolver implements MxResolver {
    constructor(private readonly dnsService: IDnsService) {}

    async resolve(domain: string): Promise<string[]> {
        try {
            const records = await this.dnsService.resolve(domain, 'MX')
            return records.map(({ exchange }) => exchange)
        } catch {
            // DNS lookup failures already produce no records. Preserve rejection for cache/adapter
            // failures without allowing hostnames, connection details, or external messages to escape.
            throw new Error('dns_mx_resolution_failed')
        }
    }
}
