import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
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
                        deductCredit: jest.fn(),
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

    const contextWithHeaders = (headers: Record<string, string>): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({ headers }),
            }),
        }) as unknown as ExecutionContext

    it('throws 401 if the API key is missing', async () => {
        await expect(guard.canActivate(contextWithHeaders({}))).rejects.toMatchObject({
            status: HttpStatus.UNAUTHORIZED,
        })
    })

    it('deducts a credit using the bearer token and allows the request', async () => {
        creditsService.deductCredit.mockResolvedValue(undefined)

        const result = await guard.canActivate(contextWithHeaders({ authorization: 'Bearer api_test' }))

        expect(result).toBe(true)
        expect(creditsService.deductCredit).toHaveBeenCalledWith('api_test')
    })

    it('deducts a credit using the x-api-key header', async () => {
        creditsService.deductCredit.mockResolvedValue(undefined)

        const result = await guard.canActivate(contextWithHeaders({ 'x-api-key': 'api_test' }))

        expect(result).toBe(true)
        expect(creditsService.deductCredit).toHaveBeenCalledWith('api_test')
    })

    it('throws 402 when credits are insufficient', async () => {
        creditsService.deductCredit.mockRejectedValue(new InsufficientCreditsException('api_test'))

        const promise = guard.canActivate(contextWithHeaders({ 'x-api-key': 'api_test' }))

        await expect(promise).rejects.toBeInstanceOf(HttpException)
        await expect(promise).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED })
    })

    it('rethrows unexpected errors', async () => {
        const error = new Error('boom')
        creditsService.deductCredit.mockRejectedValue(error)

        await expect(guard.canActivate(contextWithHeaders({ 'x-api-key': 'api_test' }))).rejects.toThrow(error)
    })
})
