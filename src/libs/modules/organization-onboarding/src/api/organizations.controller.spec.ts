import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationAcceptanceService } from '../application/invitation-acceptance.service'
import { InvitationIssuanceService } from '../application/invitation-issuance.service'
import { MembershipListingService } from '../application/membership-listing.service'
import { MembershipRemovalService } from '../application/membership-removal.service'
import { MembershipRoleChangeService } from '../application/membership-role-change.service'
import { OrganizationCreationService } from '../application/organization-creation.service'
import {
    ConflictingMembershipError,
    FinalOwnerConflictError,
    InsufficientPermissionError,
    InvitationExpiredError,
    InvitationNotFoundError,
    MembershipNotFoundError,
    NotInOrganizationError,
} from '../domain/organization-onboarding.errors'
import { OrganizationsController } from './organizations.controller'

const principal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer',
    subject: 'human-1',
    organizationId: 'org-1',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'identity-1',
}

describe('OrganizationsController', () => {
    let controller: OrganizationsController
    let organizationCreation: jest.Mocked<Pick<OrganizationCreationService, 'createWithFirstOwner'>>
    let invitationIssuance: jest.Mocked<Pick<InvitationIssuanceService, 'issue'>>
    let invitationAcceptance: jest.Mocked<Pick<InvitationAcceptanceService, 'accept'>>
    let membershipRoleChange: jest.Mocked<Pick<MembershipRoleChangeService, 'changeRole'>>
    let membershipRemoval: jest.Mocked<Pick<MembershipRemovalService, 'remove'>>
    let membershipListing: jest.Mocked<Pick<MembershipListingService, 'listActive'>>

    beforeEach(async () => {
        organizationCreation = { createWithFirstOwner: jest.fn() }
        invitationIssuance = { issue: jest.fn() }
        invitationAcceptance = { accept: jest.fn() }
        membershipRoleChange = { changeRole: jest.fn() }
        membershipRemoval = { remove: jest.fn() }
        membershipListing = { listActive: jest.fn() }

        const moduleRef = await Test.createTestingModule({
            controllers: [OrganizationsController],
            providers: [
                { provide: OrganizationCreationService, useValue: organizationCreation },
                { provide: InvitationIssuanceService, useValue: invitationIssuance },
                { provide: InvitationAcceptanceService, useValue: invitationAcceptance },
                { provide: MembershipRoleChangeService, useValue: membershipRoleChange },
                { provide: MembershipRemovalService, useValue: membershipRemoval },
                { provide: MembershipListingService, useValue: membershipListing },
            ],
        })
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        controller = moduleRef.get(OrganizationsController)
    })

    it('creates an organization and returns the organization id and invitation', async () => {
        organizationCreation.createWithFirstOwner.mockResolvedValue({
            organization: { id: 'org-1', name: 'Acme' },
            invitation: {
                id: 'invitation-1',
                organizationId: 'org-1',
                email: 'owner@example.test',
                role: 'owner',
                status: 'pending',
                expiresAt: new Date('2026-01-01T00:00:00Z'),
            },
            rawToken: 'raw-token',
        })

        const result = await controller.create({ name: 'Acme', ownerEmail: 'owner@example.test' }, principal)

        expect(organizationCreation.createWithFirstOwner).toHaveBeenCalledWith(principal, 'Acme', 'owner@example.test')
        expect(result).toEqual({
            organizationId: 'org-1',
            invitation: {
                id: 'invitation-1',
                email: 'owner@example.test',
                role: 'owner',
                expiresAt: new Date('2026-01-01T00:00:00Z'),
                token: 'raw-token',
            },
        })
    })

    it('issues an invitation and maps the raw token onto the response', async () => {
        invitationIssuance.issue.mockResolvedValue({
            invitation: {
                id: 'invitation-2',
                organizationId: 'org-1',
                email: 'new@example.test',
                role: 'member',
                status: 'pending',
                expiresAt: new Date('2026-01-02T00:00:00Z'),
            },
            rawToken: 'another-raw-token',
        })

        const result = await controller.issueInvitation(
            { organizationId: 'org-1' },
            { email: 'new@example.test', role: 'member' },
            principal,
        )

        expect(invitationIssuance.issue).toHaveBeenCalledWith(principal, 'org-1', 'new@example.test', 'member')
        expect(result.token).toBe('another-raw-token')
    })

    it('accepts an invitation without requiring a principal', async () => {
        invitationAcceptance.accept.mockResolvedValue({ organizationId: 'org-1', role: 'member', email: 'new@example.test' })

        const result = await controller.acceptInvitation({ token: 'the-token' }, { password: 'password12345' })

        expect(invitationAcceptance.accept).toHaveBeenCalledWith('the-token', 'password12345')
        expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'new@example.test' })
    })

    it('lists members mapped to the response shape', async () => {
        membershipListing.listActive.mockResolvedValue([
            {
                id: 'membership-1',
                organizationId: 'org-1',
                externalIdentityId: 'ext-1',
                externalIdentitySubject: 'kc-subject-1',
                role: 'member',
                status: 'active',
                email: 'member@example.test',
            },
        ])

        const result = await controller.listMembers({ organizationId: 'org-1' }, principal)

        expect(membershipListing.listActive).toHaveBeenCalledWith(principal, 'org-1')
        expect(result).toEqual([
            { id: 'membership-1', email: 'member@example.test', role: 'member', status: 'active' },
        ])
    })

    it('changes a member role mapped to the response shape', async () => {
        membershipRoleChange.changeRole.mockResolvedValue({
            id: 'membership-1',
            organizationId: 'org-1',
            externalIdentityId: 'ext-1',
            externalIdentitySubject: 'kc-subject-1',
            role: 'admin',
            status: 'active',
            email: 'member@example.test',
        })

        const result = await controller.changeRole(
            { organizationId: 'org-1', membershipId: 'membership-1' },
            { role: 'admin' },
            principal,
        )

        expect(membershipRoleChange.changeRole).toHaveBeenCalledWith(principal, 'org-1', 'membership-1', 'admin')
        expect(result).toEqual({ id: 'membership-1', email: 'member@example.test', role: 'admin', status: 'active' })
    })

    it('removes a member', async () => {
        await controller.removeMember({ organizationId: 'org-1', membershipId: 'membership-1' }, principal)

        expect(membershipRemoval.remove).toHaveBeenCalledWith(principal, 'org-1', 'membership-1')
    })

    describe('error mapping', () => {
        it('translates NotInOrganizationError into a 403', async () => {
            membershipListing.listActive.mockRejectedValue(new NotInOrganizationError())

            await expect(controller.listMembers({ organizationId: 'org-1' }, principal)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('translates InsufficientPermissionError into a 403', async () => {
            membershipListing.listActive.mockRejectedValue(new InsufficientPermissionError('nope'))

            await expect(controller.listMembers({ organizationId: 'org-1' }, principal)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('translates MembershipNotFoundError into a 404', async () => {
            membershipRoleChange.changeRole.mockRejectedValue(new MembershipNotFoundError())

            await expect(
                controller.changeRole({ organizationId: 'org-1', membershipId: 'm-1' }, { role: 'admin' }, principal),
            ).rejects.toThrow(NotFoundException)
        })

        it('translates InvitationNotFoundError into a 404', async () => {
            invitationAcceptance.accept.mockRejectedValue(new InvitationNotFoundError())

            await expect(
                controller.acceptInvitation({ token: 't' }, { password: 'password12345' }),
            ).rejects.toThrow(NotFoundException)
        })

        it('translates ConflictingMembershipError into a 409', async () => {
            invitationAcceptance.accept.mockRejectedValue(new ConflictingMembershipError())

            await expect(
                controller.acceptInvitation({ token: 't' }, { password: 'password12345' }),
            ).rejects.toThrow(ConflictException)
        })

        it('translates FinalOwnerConflictError into a 409', async () => {
            membershipRemoval.remove.mockRejectedValue(new FinalOwnerConflictError('nope'))

            await expect(
                controller.removeMember({ organizationId: 'org-1', membershipId: 'm-1' }, principal),
            ).rejects.toThrow(ConflictException)
        })

        it('translates InvitationExpiredError into a 410', async () => {
            invitationAcceptance.accept.mockRejectedValue(new InvitationExpiredError())

            await expect(
                controller.acceptInvitation({ token: 't' }, { password: 'password12345' }),
            ).rejects.toThrow(GoneException)
        })
    })
})
