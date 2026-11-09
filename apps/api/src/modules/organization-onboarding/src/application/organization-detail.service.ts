import {
    AuthPrincipal,
    OrganizationDirectoryReader,
    OrganizationDirectoryRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, OrganizationNotFoundError } from '../domain/organization-onboarding.errors'

export class OrganizationDetailService {
    constructor(private readonly reader: OrganizationDirectoryReader) {}

    async get(actor: AuthPrincipal, organizationId: string): Promise<OrganizationDirectoryRecord> {
        const authorized = actor.credentialKind === 'service_client'
            ? actor.permissions.includes('platform:admin')
            : actor.membershipRole === 'platform_admin'
        if (!authorized) throw new InsufficientPermissionError('Platform administration permission is required')

        const organization = await this.reader.findById(organizationId)
        if (!organization) throw new OrganizationNotFoundError()
        return organization
    }
}
