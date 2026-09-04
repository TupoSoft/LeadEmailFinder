import { Test } from '@nestjs/testing'
import { CreditsController } from './credits.controller'
import { CreditsService } from '../application/credits.service'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { ConflictException } from '@nestjs/common'
import { Request } from 'express'
import { CreditIdempotencyConflict } from '../domain/credits.error'

describe('CreditsController', () => {
    let controller: CreditsController
    let service: jest.Mocked<CreditsService>

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [CreditsController],
            providers: [
                {
                    provide: CreditsService,
                    useValue: {
                        getBalance: jest.fn(),
                        addPlatformCredits: jest.fn(),
                        setBalance: jest.fn(),
                    },
                },
            ],
        })
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        controller = moduleRef.get(CreditsController)
        service = moduleRef.get(CreditsService)
    })

    const organizationId = '5b92ded1-7eba-4c66-b72e-a5fea465da68'
    const idempotencyKey = '841668a4-3ba2-4a6d-92a9-969bd60c5121'
    const request = { rawHeaders: ['Idempotency-Key', idempotencyKey] } as Request

    it('returns the balance for an organization', async () => {
        service.getBalance.mockResolvedValue(10)

        await expect(controller.getBalance({ organizationId })).resolves.toEqual({ balance: 10 })
        expect(service.getBalance).toHaveBeenCalledWith(organizationId)
    })

    it('adds credits to an organization', async () => {
        service.addPlatformCredits.mockResolvedValue(15)

        await expect(controller.addCredits({ organizationId }, { amount: 5 }, request)).resolves.toEqual({
            balance: 15,
        })
        expect(service.addPlatformCredits).toHaveBeenCalledWith(organizationId, 5, idempotencyKey)
    })

    it('maps only the application idempotency conflict to HTTP 409', async () => {
        service.addPlatformCredits.mockRejectedValue(new CreditIdempotencyConflict())

        await expect(controller.addCredits({ organizationId }, { amount: 5 }, request)).rejects.toThrow(
            ConflictException,
        )
    })

    it('preserves unrelated failures', async () => {
        const failure = new Error('ledger unavailable')
        service.addPlatformCredits.mockRejectedValue(failure)

        await expect(controller.addCredits({ organizationId }, { amount: 5 }, request)).rejects.toBe(failure)
    })

    it('sets the balance for an organization', async () => {
        service.setBalance.mockResolvedValue(7)

        await expect(controller.setBalance({ organizationId }, { amount: 7 })).resolves.toEqual({ balance: 7 })
        expect(service.setBalance).toHaveBeenCalledWith(organizationId, 7)
    })
})
