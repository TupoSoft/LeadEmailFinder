import { Test } from '@nestjs/testing'
import { CreditsController } from './credits.controller'
import { CreditsService } from './credits.service'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'

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
                        addCredits: jest.fn(),
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

    it('returns the balance for an organization', async () => {
        service.getBalance.mockResolvedValue(10)

        await expect(controller.getBalance({ organizationId })).resolves.toEqual({ balance: 10 })
        expect(service.getBalance).toHaveBeenCalledWith(organizationId)
    })

    it('adds credits to an organization', async () => {
        service.addCredits.mockResolvedValue(15)

        await expect(controller.addCredits({ organizationId }, { amount: 5 })).resolves.toEqual({ balance: 15 })
        expect(service.addCredits).toHaveBeenCalledWith(organizationId, 5)
    })

    it('sets the balance for an organization', async () => {
        service.setBalance.mockResolvedValue(7)

        await expect(controller.setBalance({ organizationId }, { amount: 7 })).resolves.toEqual({ balance: 7 })
        expect(service.setBalance).toHaveBeenCalledWith(organizationId, 7)
    })
})
