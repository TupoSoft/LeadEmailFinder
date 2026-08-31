import {
    AuthPrincipal,
    AuthRole,
    InvitationStore,
    OrganizationInvitationRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, NotInOrganizationError } from '../domain/organization-onboarding.errors'
import { generateInvitationToken, INVITATION_TTL_MS } from '../domain/invitation-token'

export interface InvitationIssuanceResult {
    readonly invitation: OrganizationInvitationRecord
    readonly rawToken: string
}

export class InvitationIssuanceService {
    constructor(private readonly store: InvitationStore) {}

    async issue(
        actor: AuthPrincipal,
        organizationId: string,
        email: string,
        role: AuthRole,
    ): Promise<InvitationIssuanceResult> {
        if (actor.organizationId !== organizationId) {
            throw new NotInOrganizationError()
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new InsufficientPermissionError('Only an owner or admin may invite members')
        }
        if (actor.membershipRole === 'admin' && role === 'owner') {
            throw new InsufficientPermissionError('Admins cannot grant the owner role')
        }

        const { rawToken, tokenHash } = generateInvitationToken()
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        const normalizedEmail = email.toLowerCase()

        const invitation = await this.store.issueWithAudit({
            organizationId,
            email: normalizedEmail,
            role,
            tokenHash,
            expiresAt,
            actor,
        })

        return { invitation, rawToken }
    }
}
