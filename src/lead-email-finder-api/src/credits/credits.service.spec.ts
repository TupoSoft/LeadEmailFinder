import { getRepositoryToken } from '@nestjs/typeorm'
import { Test, TestingModule } from '@nestjs/testing'
import { CreditsService } from './credits.service'
import { Repository } from 'typeorm'
import { Credit } from './credit.entity'
import { InsufficientCreditsException } from './credits.error'

describe('CreditsService', () => {
    let service: CreditsService
    let creditRepoMock: jest.Mocked<Pick<Repository<Credit>, 'findOneBy' | 'save' | 'create'>> & {
        createQueryBuilder: jest.Mock
    }
    let queryBuilderMock: {
        update: jest.Mock
        set: jest.Mock
        where: jest.Mock
        andWhere: jest.Mock
        setParameters: jest.Mock
        execute: jest.Mock
    }

    beforeEach(async () => {
        queryBuilderMock = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            setParameters: jest.fn().mockReturnThis(),
            execute: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CreditsService,
                {
                    provide: getRepositoryToken(Credit),
                    useValue: {
                        findOneBy: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
                        createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
                    },
                },
            ],
        }).compile()

        service = module.get(CreditsService)
        creditRepoMock = module.get(getRepositoryToken(Credit))
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('deductCredits', () => {
        it('deducts credits when the balance is sufficient', async () => {
            queryBuilderMock.execute.mockResolvedValue({ affected: 1 })

            await expect(service.deductCredits('api_test', 3)).resolves.toBeUndefined()

            expect(queryBuilderMock.where).toHaveBeenCalledWith('token = :token', { token: 'api_test' })
            expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('balance >= :count', { count: 3 })
            expect(queryBuilderMock.setParameters).toHaveBeenCalledWith({ token: 'api_test', count: 3 })
        })

        it('throws InsufficientCreditsException when nothing was affected', async () => {
            queryBuilderMock.execute.mockResolvedValue({ affected: 0 })

            await expect(service.deductCredits('api_test', 3)).rejects.toThrow(InsufficientCreditsException)
        })
    })

    describe('deductCredit', () => {
        it('deducts exactly one credit', async () => {
            queryBuilderMock.execute.mockResolvedValue({ affected: 1 })

            await service.deductCredit('api_test')

            expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('balance >= :count', { count: 1 })
        })
    })

    describe('addCredits', () => {
        it('creates a new row when none exists', async () => {
            creditRepoMock.findOneBy.mockResolvedValue(null)
            creditRepoMock.create.mockReturnValue({ token: 'api_test', balance: 0 } as Credit)
            creditRepoMock.save.mockResolvedValue({ token: 'api_test', balance: 5 } as Credit)

            const result = await service.addCredits('api_test', 5)

            expect(creditRepoMock.create).toHaveBeenCalledWith({ token: 'api_test', balance: 0 })
            expect(result).toBe(5)
        })

        it('increments the balance of an existing row', async () => {
            creditRepoMock.findOneBy.mockResolvedValue({ token: 'api_test', balance: 10 } as Credit)
            creditRepoMock.save.mockImplementation(credit => Promise.resolve(credit as Credit))

            const result = await service.addCredits('api_test', 5)

            expect(result).toBe(15)
        })
    })

    describe('setBalance', () => {
        it('sets the balance of an existing row', async () => {
            creditRepoMock.findOneBy.mockResolvedValue({ token: 'api_test', balance: 10 } as Credit)
            creditRepoMock.save.mockImplementation(credit => Promise.resolve(credit as Credit))

            const result = await service.setBalance('api_test', 7)

            expect(result).toBe(7)
        })

        it('creates a new row when none exists', async () => {
            creditRepoMock.findOneBy.mockResolvedValue(null)
            creditRepoMock.create.mockReturnValue({ token: 'api_test' } as Credit)
            creditRepoMock.save.mockImplementation(credit => Promise.resolve(credit as Credit))

            const result = await service.setBalance('api_test', 7)

            expect(creditRepoMock.create).toHaveBeenCalledWith({ token: 'api_test' })
            expect(result).toBe(7)
        })
    })

    describe('getBalance', () => {
        it('returns the balance when the row exists', async () => {
            creditRepoMock.findOneBy.mockResolvedValue({ token: 'api_test', balance: 42 } as Credit)

            await expect(service.getBalance('api_test')).resolves.toBe(42)
        })

        it('returns 0 when no row exists', async () => {
            creditRepoMock.findOneBy.mockResolvedValue(null)

            await expect(service.getBalance('api_test')).resolves.toBe(0)
        })
    })
})
