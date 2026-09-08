import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AuthPrincipal, ServiceCredentialDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { ServiceClientCreationService } from '../application/service-client-creation.service'
import { ServiceClientDeletionService } from '../application/service-client-deletion.service'
import { ServiceClientDisablementService } from '../application/service-client-disablement.service'
import { ServiceClientListingService } from '../application/service-client-listing.service'
import { ServiceClientRotationService } from '../application/service-client-rotation.service'
import {
    DisabledServiceClientRotationError,
    DuplicateServiceClientPermissionsError,
    ServiceClientAccessDeniedError,
    ServiceClientNotFoundError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'
import { ServiceClientsController } from './service-clients.controller'

const principal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer',
    subject: 'human-1',
    organizationId: 'org-1',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'identity-1',
}

function credentialFixture(overrides: Partial<ServiceCredentialDetailRecord> = {}): ServiceCredentialDetailRecord {
    return {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'sa-1',
        keycloakClientId: 'lef-svc-1',
        description: null,
        permissions: ['verification:run'],
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    }
}

describe('ServiceClientsController', () => {
    let controller: ServiceClientsController
    let creation: jest.Mocked<Pick<ServiceClientCreationService, 'create'>>
    let listing: jest.Mocked<Pick<ServiceClientListingService, 'list'>>
    let rotation: jest.Mocked<Pick<ServiceClientRotationService, 'rotate'>>
    let disablement: jest.Mocked<Pick<ServiceClientDisablementService, 'disable'>>
    let deletion: jest.Mocked<Pick<ServiceClientDeletionService, 'delete'>>

    beforeEach(async () => {
        creation = { create: jest.fn() }
        listing = { list: jest.fn() }
        rotation = { rotate: jest.fn() }
        disablement = { disable: jest.fn() }
        deletion = { delete: jest.fn() }

        const moduleRef = await Test.createTestingModule({
            controllers: [ServiceClientsController],
            providers: [
                { provide: ServiceClientCreationService, useValue: creation },
                { provide: ServiceClientListingService, useValue: listing },
                { provide: ServiceClientRotationService, useValue: rotation },
                { provide: ServiceClientDisablementService, useValue: disablement },
                { provide: ServiceClientDeletionService, useValue: deletion },
            ],
        })
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        controller = moduleRef.get(ServiceClientsController)
    })

    it('creates a service client and returns the secret once', async () => {
        creation.create.mockResolvedValue({ credential: credentialFixture(), secret: 'a-secret' })

        const result = await controller.create(
            { organizationId: 'org-1' },
            { description: 'ci', permissions: ['verification:run'] },
            principal,
        )

        expect(creation.create).toHaveBeenCalledWith(principal, 'org-1', 'ci', ['verification:run'])
        expect(result).toMatchObject({ id: 'sc-1', clientId: 'lef-svc-1', clientSecret: 'a-secret' })
    })

    it('defaults a missing description to null', async () => {
        creation.create.mockResolvedValue({ credential: credentialFixture(), secret: 'a-secret' })

        await controller.create({ organizationId: 'org-1' }, { permissions: ['verification:run'] }, principal)

        expect(creation.create).toHaveBeenCalledWith(principal, 'org-1', null, ['verification:run'])
    })

    it('lists service clients mapped to the response shape, with no secret field', async () => {
        listing.list.mockResolvedValue([credentialFixture({ status: 'disabled' })])

        const result = await controller.list({ organizationId: 'org-1' }, principal)

        expect(listing.list).toHaveBeenCalledWith(principal, 'org-1')
        expect(result).toEqual([expect.objectContaining({ id: 'sc-1', clientId: 'lef-svc-1', status: 'disabled' })])
        expect(result[0]).not.toHaveProperty('clientSecret')
    })

    it('rotates a service client and returns the new secret once', async () => {
        rotation.rotate.mockResolvedValue({ credential: credentialFixture(), secret: 'new-secret' })

        const result = await controller.rotate({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal)

        expect(rotation.rotate).toHaveBeenCalledWith(principal, 'org-1', 'sc-1')
        expect(result).toMatchObject({ clientSecret: 'new-secret' })
    })

    it('disables a service client', async () => {
        await controller.disable({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal)

        expect(disablement.disable).toHaveBeenCalledWith(principal, 'org-1', 'sc-1')
    })

    it('deletes a service client', async () => {
        await controller.remove({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal)

        expect(deletion.delete).toHaveBeenCalledWith(principal, 'org-1', 'sc-1')
    })

    it('maps application access denial to ForbiddenException', async () => {
        creation.create.mockRejectedValue(
            new ServiceClientAccessDeniedError('Only an owner or admin may create service clients'),
        )

        await expect(
            controller.create({ organizationId: 'org-1' }, { permissions: ['verification:run'] }, principal),
        ).rejects.toThrow(ForbiddenException)
    })

    it('maps permission-ceiling validation to BadRequestException', async () => {
        creation.create.mockRejectedValue(new ServiceClientPermissionCeilingExceededError(['billing:manage']))

        await expect(
            controller.create({ organizationId: 'org-1' }, { permissions: ['billing:manage'] }, principal),
        ).rejects.toThrow(BadRequestException)
    })

    it('maps concealed missing clients to NotFoundException', async () => {
        rotation.rotate.mockRejectedValue(new ServiceClientNotFoundError())

        await expect(
            controller.rotate({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal),
        ).rejects.toThrow(NotFoundException)
    })

    it('maps duplicate permissions rejected by the application to BadRequestException', async () => {
        creation.create.mockRejectedValue(new DuplicateServiceClientPermissionsError())

        await expect(
            controller.create({ organizationId: 'org-1' }, { permissions: ['verification:run'] }, principal),
        ).rejects.toThrow(BadRequestException)
    })

    it('maps disabled rotation to ConflictException', async () => {
        rotation.rotate.mockRejectedValue(new DisabledServiceClientRotationError())

        await expect(
            controller.rotate({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal),
        ).rejects.toThrow(ConflictException)
    })

    it('preserves unknown provider and persistence errors', async () => {
        const error = new Error('provider unavailable')
        deletion.delete.mockRejectedValue(error)

        await expect(controller.remove({ organizationId: 'org-1', serviceClientId: 'sc-1' }, principal)).rejects.toBe(
            error,
        )
    })
})
