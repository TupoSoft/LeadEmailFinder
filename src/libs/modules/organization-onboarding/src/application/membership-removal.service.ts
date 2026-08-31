import { AuthPrincipal, MembershipMutationStore } from '@tuposoft/lead-email-finder/modules/identity'
import {
    FinalOwnerConflictError,
    InsufficientPermissionError,
    MembershipNotFoundError,
    NotInOrganizationError,
} from '../domain/organization-onboarding.errors'

export class MembershipRemovalService {
    constructor(private readonly store: MembershipMutationStore) {}

    async remove(actor: AuthPrincipal, organizationId: string, membershipId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new NotInOrganizationError()
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new InsufficientPermissionError('Only an owner or admin may remove members')
        }

        const begun = await this.store.begin(organizationId, membershipId)
        if (begun.kind === 'not-found') {
            throw new MembershipNotFoundError()
        }

        const { membership, activeOwnerCount } = begun.context
        const session = begun.session

        if (membership.status === 'disabled') {
            await session.abort()
            return
        }

        let settled = false
        try {
            if (actor.membershipRole === 'admin' && membership.role === 'owner') {
                throw new InsufficientPermissionError('Admins cannot remove an owner')
            }
            if (membership.role === 'owner' && activeOwnerCount <= 1) {
                throw new FinalOwnerConflictError('Cannot remove the final owner of an organization')
            }

            await session.disable(actor)
            settled = true
        } finally {
            if (!settled) {
                await session.abort()
            }
        }
    }
}
