import { getRepositoryToken } from '@nestjs/typeorm'
import { Test, TestingModule } from '@nestjs/testing'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { CreditDebit, OrganizationCreditAccount } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './credits.service'
import { InsufficientCreditsException } from './credits.error'

describe('CreditsService', () => {
    let service: CreditsService
    let accountRepoMock: jest.Mocked<Pick<Repository<OrganizationCreditAccount>, 'findOneBy' | 'save' | 'create'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'findOne' | 'existsBy' | 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }

    beforeEach(async () => {
        managerMock = {
            findOne: jest.fn(),
            existsBy: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
        }
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CreditsService,
                {
                    provide: getRepositoryToken(OrganizationCreditAccount),
                    useValue: {
                        findOneBy: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
                    },
                },
                {
                    provide: DataSource,
                    useValue: dataSourceMock,
                },
            ],
        }).compile()

        service = module.get(CreditsService)
        accountRepoMock = module.get(getRepositoryToken(OrganizationCreditAccount))
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('debit', () => {
        const organizationId = 'org-1'

        it('decrements the balance and records the reference when sufficient and new', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(false)

            await expect(service.debit(organizationId, 3, 'ref-1')).resolves.toBeUndefined()

            expect(managerMock.findOne).toHaveBeenCalledWith(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 7 }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(CreditDebit, {
                organizationId,
                reference: 'ref-1',
                amount: 3,
            })
        })

        it('throws InsufficientCreditsException without writing when the balance is too low', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 1 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(false)

            await expect(service.debit(organizationId, 3, 'ref-1')).rejects.toThrow(InsufficientCreditsException)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('throws InsufficientCreditsException when no account exists', async () => {
            managerMock.findOne.mockResolvedValue(null)

            await expect(service.debit(organizationId, 1, 'ref-1')).rejects.toThrow(InsufficientCreditsException)

            expect(managerMock.existsBy).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('is idempotent: a reference already charged resolves without writing again', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(true)

            await expect(service.debit(organizationId, 3, 'ref-1')).resolves.toBeUndefined()

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('addCredits', () => {
        it('creates a new account when none exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)
            accountRepoMock.create.mockReturnValue({ organizationId: 'org-1', balance: 0 } as OrganizationCreditAccount)
            accountRepoMock.save.mockResolvedValue({ organizationId: 'org-1', balance: 5 } as OrganizationCreditAccount)

            const result = await service.addCredits('org-1', 5)

            expect(accountRepoMock.create).toHaveBeenCalledWith({ organizationId: 'org-1', balance: 0 })
            expect(result).toBe(5)
        })

        it('increments the balance of an existing account', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({ organizationId: 'org-1', balance: 10 } as OrganizationCreditAccount)
            accountRepoMock.save.mockImplementation(account => Promise.resolve(account as OrganizationCreditAccount))

            const result = await service.addCredits('org-1', 5)

            expect(result).toBe(15)
        })
    })

    describe('setBalance', () => {
        it('sets the balance of an existing account', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({ organizationId: 'org-1', balance: 10 } as OrganizationCreditAccount)
            accountRepoMock.save.mockImplementation(account => Promise.resolve(account as OrganizationCreditAccount))

            const result = await service.setBalance('org-1', 7)

            expect(result).toBe(7)
        })

        it('creates a new account when none exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)
            accountRepoMock.create.mockReturnValue({ organizationId: 'org-1' } as OrganizationCreditAccount)
            accountRepoMock.save.mockImplementation(account => Promise.resolve(account as OrganizationCreditAccount))

            const result = await service.setBalance('org-1', 7)

            expect(accountRepoMock.create).toHaveBeenCalledWith({ organizationId: 'org-1' })
            expect(result).toBe(7)
        })
    })

    describe('getBalance', () => {
        it('returns the balance when the account exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({ organizationId: 'org-1', balance: 42 } as OrganizationCreditAccount)

            await expect(service.getBalance('org-1')).resolves.toBe(42)
        })

        it('returns 0 when no account exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)

            await expect(service.getBalance('org-1')).resolves.toBe(0)
        })
    })
})
