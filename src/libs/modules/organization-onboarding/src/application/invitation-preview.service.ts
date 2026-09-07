import { InvitationPreviewReader, InvitationPreviewRecord } from '@tuposoft/lead-email-finder/modules/identity'
import {
    InvitationConsumedError,
    InvitationExpiredError,
    InvitationNotFoundError,
} from '../domain/organization-onboarding.errors'
import { hashInvitationToken } from '../domain/invitation-token'

export class InvitationPreviewService {
    constructor(private readonly reader: InvitationPreviewReader) {}

    async preview(rawToken: string): Promise<InvitationPreviewRecord & { readonly status: 'pending' }> {
        const invitation = await this.reader.findByTokenHash(hashInvitationToken(rawToken))
        if (!invitation) throw new InvitationNotFoundError()
        if (invitation.status !== 'pending') throw new InvitationConsumedError()
        if (invitation.expiresAt.getTime() <= Date.now()) throw new InvitationExpiredError()
        return {
            organizationName: invitation.organizationName,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            status: 'pending',
        }
    }
}
