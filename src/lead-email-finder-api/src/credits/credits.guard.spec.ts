import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditGuard } from './credits.guard'
import { CreditsService } from './credits.service'
import { InsufficientCreditsException } from './credits.error'

describe('CreditGuard', () => {
    let guard: CreditGuard
    let creditsService: jest.Mocked<CreditsService>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CreditGuard,
                {
                    provide: CreditsService,
                    useValue: {
                        debit: jest.fn(),
                    },
                },
            ],
        }).compile()

        guard = module.get(CreditGuard)
        creditsService = module.get(CreditsService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    const contextWithRequest = (request: { authPrincipal?: AuthPrincipal }): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        }) as unknown as ExecutionContext

    const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal

    it('throws 401 if no authentication principal is on the request', async () => {
        await expect(guard.canActivate(contextWithRequest({}))).rejects.toMatchObject({
            status: HttpStatus.UNAUTHORIZED,
        })
    })

    it('debits one credit from the principal organization and allows the request', async () => {
        creditsService.debit.mockResolvedValue(undefined)

        const result = await guard.canActivate(contextWithRequest({ authPrincipal: principal }))

        expect(result).toBe(true)
        expect(creditsService.debit).toHaveBeenCalledWith('org-1', 1, expect.any(String))
    })

    it('throws 402 when credits are insufficient', async () => {
        creditsService.debit.mockRejectedValue(new InsufficientCreditsException('org-1'))

        const promise = guard.canActivate(contextWithRequest({ authPrincipal: principal }))

        await expect(promise).rejects.toBeInstanceOf(HttpException)
        await expect(promise).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED })
    })

    it('rethrows unexpected errors', async () => {
        const error = new Error('boom')
        creditsService.debit.mockRejectedValue(error)

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).rejects.toThrow(error)
    })
})
