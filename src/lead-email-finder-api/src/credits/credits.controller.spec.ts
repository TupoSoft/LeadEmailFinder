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

    it('returns the balance for an API key', async () => {
        service.getBalance.mockResolvedValue(10)

        await expect(controller.getBalance('api_test')).resolves.toEqual({ balance: 10 })
        expect(service.getBalance).toHaveBeenCalledWith('api_test')
    })

    it('adds credits to an API key', async () => {
        service.addCredits.mockResolvedValue(15)

        await expect(controller.addCredits('api_test', { amount: 5 })).resolves.toEqual({ balance: 15 })
        expect(service.addCredits).toHaveBeenCalledWith('api_test', 5)
    })

    it('sets the balance for an API key', async () => {
        service.setBalance.mockResolvedValue(7)

        await expect(controller.setBalance('api_test', { amount: 7 })).resolves.toEqual({ balance: 7 })
        expect(service.setBalance).toHaveBeenCalledWith('api_test', 7)
    })
})
