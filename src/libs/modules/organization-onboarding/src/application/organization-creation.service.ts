import {
    AuthPrincipal,
    OrganizationInvitationRecord,
    OrganizationRecord,
    OrganizationRegistrationStore,
} from '@tuposoft/lead-email-finder/modules/identity'
import { generateInvitationToken, INVITATION_TTL_MS } from '../domain/invitation-token'

export interface OrganizationCreationResult {
    readonly organization: OrganizationRecord
    readonly invitation: OrganizationInvitationRecord
    readonly rawToken: string
}

export class OrganizationCreationService {
    constructor(private readonly store: OrganizationRegistrationStore) {}

    async createWithFirstOwner(
        actor: AuthPrincipal,
        name: string,
        ownerEmail: string,
    ): Promise<OrganizationCreationResult> {
        const { rawToken, tokenHash } = generateInvitationToken()
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        const email = ownerEmail.toLowerCase()

        const { organization, invitation } = await this.store.createWithOwnerInvitation({
            name,
            ownerEmail: email,
            tokenHash,
            expiresAt,
            actor,
        })

        return { organization, invitation, rawToken }
    }
}
