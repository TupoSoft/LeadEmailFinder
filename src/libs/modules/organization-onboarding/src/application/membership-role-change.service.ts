import {
    AuthPrincipal,
    AuthRole,
    MembershipMutationStore,
    OrganizationMembershipDetailRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    FinalOwnerConflictError,
    InsufficientPermissionError,
    MembershipNotFoundError,
    NotInOrganizationError,
} from '../domain/organization-onboarding.errors'
import { KeycloakOrganizationAdmin } from './ports/keycloak-organization-admin'

export class MembershipRoleChangeService {
    constructor(
        private readonly store: MembershipMutationStore,
        private readonly keycloakAdmin: KeycloakOrganizationAdmin,
    ) {}

    async changeRole(
        actor: AuthPrincipal,
        organizationId: string,
        membershipId: string,
        newRole: AuthRole,
    ): Promise<OrganizationMembershipDetailRecord> {
        if (actor.organizationId !== organizationId) {
            throw new NotInOrganizationError()
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new InsufficientPermissionError('Only an owner or admin may change member roles')
        }

        const begun = await this.store.begin(organizationId, membershipId)
        if (begun.kind === 'not-found') {
            throw new MembershipNotFoundError()
        }

        const { membership, activeOwnerCount } = begun.context
        const session = begun.session
        let result: OrganizationMembershipDetailRecord | undefined
        try {
            if (actor.membershipRole === 'admin' && (newRole === 'owner' || membership.role === 'owner')) {
                throw new InsufficientPermissionError('Admins cannot grant or modify the owner role')
            }
            if (membership.role === 'owner' && newRole !== 'owner' && activeOwnerCount <= 1) {
                throw new FinalOwnerConflictError('Cannot demote the final owner of an organization')
            }

            if (newRole === 'owner' || newRole === 'admin') {
                await this.keycloakAdmin.assignRealmRole(membership.externalIdentitySubject, newRole)
            }

            result = await session.changeRole(newRole, actor)
            return result
        } finally {
            if (result === undefined) {
                await session.abort()
            }
        }
    }
}
