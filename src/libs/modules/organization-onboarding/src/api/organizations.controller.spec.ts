import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationPreviewService } from '../application/invitation-preview.service'
import { InvitationAcceptanceService } from '../application/invitation-acceptance.service'
import { InvitationIssuanceService } from '../application/invitation-issuance.service'
import { MembershipListingService } from '../application/membership-listing.service'
import { MembershipRemovalService } from '../application/membership-removal.service'
import { MembershipRoleChangeService } from '../application/membership-role-change.service'
import { OrganizationCreationService } from '../application/organization-creation.service'
import { OrganizationListingService } from '../application/organization-listing.service'
import {
    ConflictingMembershipError,
    FinalOwnerConflictError,
    InsufficientPermissionError,
    InvalidOrganizationCursorError,
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
    let organizationListing: jest.Mocked<Pick<OrganizationListingService, 'list'>>
    let invitationIssuance: jest.Mocked<Pick<InvitationIssuanceService, 'issue'>>
    let invitationAcceptance: jest.Mocked<Pick<InvitationAcceptanceService, 'accept'>>
    let membershipRoleChange: jest.Mocked<Pick<MembershipRoleChangeService, 'changeRole'>>
    let membershipRemoval: jest.Mocked<Pick<MembershipRemovalService, 'remove'>>
    let membershipListing: jest.Mocked<Pick<MembershipListingService, 'listForOrganization'>>

    beforeEach(async () => {
        organizationCreation = { createWithFirstOwner: jest.fn() }
        organizationListing = { list: jest.fn() }
        invitationIssuance = { issue: jest.fn() }
        invitationAcceptance = { accept: jest.fn() }
        membershipRoleChange = { changeRole: jest.fn() }
        membershipRemoval = { remove: jest.fn() }
        membershipListing = { listForOrganization: jest.fn() }

        const moduleRef = await Test.createTestingModule({
            controllers: [OrganizationsController],
            providers: [
                { provide: OrganizationCreationService, useValue: organizationCreation },
                { provide: OrganizationListingService, useValue: organizationListing },
                { provide: InvitationIssuanceService, useValue: invitationIssuance },
                { provide: InvitationPreviewService, useValue: { preview: jest.fn() } },
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

    it('passes the typed page size and unchanged opaque cursor to the listing use case', async () => {
        organizationListing.list.mockResolvedValue({ organizations: [], nextPageToken: 'next' })
        await expect(controller.list({ pageSize: 20, pageToken: 'opaque' }, principal)).resolves.toEqual({
            organizations: [], nextPageToken: 'next',
        })
        expect(organizationListing.list).toHaveBeenCalledWith(principal, 20, 'opaque')
    })

    it('maps an invalid directory cursor to 400 without exposing its contents', async () => {
        organizationListing.list.mockRejectedValue(new InvalidOrganizationCursorError())
        await expect(controller.list({ pageSize: 20, pageToken: 'invalid' }, principal)).rejects.toThrow(BadRequestException)
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
        membershipListing.listForOrganization.mockResolvedValue([
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

        expect(membershipListing.listForOrganization).toHaveBeenCalledWith(principal, 'org-1')
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
            membershipListing.listForOrganization.mockRejectedValue(new NotInOrganizationError())

            await expect(controller.listMembers({ organizationId: 'org-1' }, principal)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('translates InsufficientPermissionError into a 403', async () => {
            membershipListing.listForOrganization.mockRejectedValue(new InsufficientPermissionError('nope'))

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
