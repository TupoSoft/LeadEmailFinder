import { DataSource, EntityManager, Repository } from 'typeorm'
import { CreditDebit } from './credit-debit.entity'
import { CreditGrant } from './credit-grant.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { TypeOrmCreditLedgerStore } from './typeorm-credit-ledger-store'

describe('TypeOrmCreditLedgerStore', () => {
    let store: TypeOrmCreditLedgerStore
    let accountRepoMock: jest.Mocked<Pick<Repository<OrganizationCreditAccount>, 'findOneBy' | 'save' | 'create'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'findOne' | 'existsBy' | 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }

    beforeEach(() => {
        managerMock = {
            findOne: jest.fn(),
            existsBy: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
        }
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        accountRepoMock = { findOneBy: jest.fn(), save: jest.fn(), create: jest.fn() }
        store = new TypeOrmCreditLedgerStore(
            dataSourceMock as unknown as DataSource,
            accountRepoMock as unknown as Repository<OrganizationCreditAccount>,
        )
    })

    describe('debit', () => {
        const organizationId = 'org-1'

        it('decrements the balance and records the reference when sufficient and new', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(false)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('applied')

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

        it('reports insufficient-balance without writing when the balance is too low', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 1 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(false)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('insufficient-balance')

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('reports account-missing when no account exists', async () => {
            managerMock.findOne.mockResolvedValue(null)

            await expect(store.debit(organizationId, 1, 'ref-1')).resolves.toBe('account-missing')

            expect(managerMock.existsBy).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('is idempotent: a reference already charged reports replayed without writing again', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(true)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('replayed')

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('reports replayed even when a replayed reference is now below the required balance', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId, balance: 1 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(true)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('replayed')
        })
    })

    describe('credit', () => {
        it('creates a new account when none exists', async () => {
            managerMock.findOne.mockResolvedValue(null)
            managerMock.existsBy.mockResolvedValue(false)
            managerMock.save.mockResolvedValue({ organizationId: 'org-1', balance: 5 } as OrganizationCreditAccount)

            const result = await store.credit('org-1', 5, 'ref-1')

            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ organizationId: 'org-1', balance: 5 }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(CreditGrant, {
                organizationId: 'org-1',
                reference: 'ref-1',
                amount: 5,
            })
            expect(result).toBe(5)
        })

        it('increments and returns the balance of an existing account', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId: 'org-1', balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(false)
            managerMock.save.mockImplementation((_entity, account) =>
                Promise.resolve(account as OrganizationCreditAccount),
            )

            const result = await store.credit('org-1', 5, 'ref-1')

            expect(result).toBe(15)
        })

        it('returns the current balance without writing when the reference already exists', async () => {
            managerMock.findOne.mockResolvedValue({ organizationId: 'org-1', balance: 10 } as OrganizationCreditAccount)
            managerMock.existsBy.mockResolvedValue(true)

            await expect(store.credit('org-1', 5, 'ref-1')).resolves.toBe(10)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('debitUpTo', () => {
        it('clamps to the available balance and returns the amount persisted in the ledger', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 3 } as OrganizationCreditAccount)
                .mockResolvedValueOnce(null)

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(3)

            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 0 }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(CreditDebit, {
                organizationId: 'org-1',
                reference: 'adjustment-1',
                amount: 3,
            })
        })

        it('records and replays a zero applied debit without charging a later balance', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 0 } as OrganizationCreditAccount)
                .mockResolvedValueOnce(null)

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(0)
            expect(managerMock.insert).toHaveBeenCalledWith(CreditDebit, {
                organizationId: 'org-1',
                reference: 'adjustment-1',
                amount: 0,
            })

            jest.clearAllMocks()
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 20 } as OrganizationCreditAccount)
                .mockResolvedValueOnce({ amount: 0 } as CreditDebit)

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(0)
            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('returns the originally applied amount for a nonzero replay', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 50 } as OrganizationCreditAccount)
                .mockResolvedValueOnce({ amount: 7 } as CreditDebit)

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(7)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('creditOnce', () => {
        it('credits the account and reports the applied operation amount', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 3 } as OrganizationCreditAccount)
                .mockResolvedValueOnce(null)
            managerMock.save.mockImplementation((_entity, account) =>
                Promise.resolve(account as OrganizationCreditAccount),
            )

            await expect(store.creditOnce('org-1', 7, 'restore-1')).resolves.toBe(7)

            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 10 }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(CreditGrant, {
                organizationId: 'org-1',
                reference: 'restore-1',
                amount: 7,
            })
        })

        it('returns the original grant amount without crediting a replay again', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 10 } as OrganizationCreditAccount)
                .mockResolvedValueOnce({ amount: 7 } as CreditGrant)

            await expect(store.creditOnce('org-1', 7, 'restore-1')).resolves.toBe(7)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('setBalance', () => {
        it('sets the balance of an existing account', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
            } as OrganizationCreditAccount)
            accountRepoMock.save.mockImplementation(account => Promise.resolve(account as OrganizationCreditAccount))

            const result = await store.setBalance('org-1', 7)

            expect(result).toBe(7)
        })

        it('creates a new account when none exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)
            accountRepoMock.create.mockReturnValue({ organizationId: 'org-1' } as OrganizationCreditAccount)
            accountRepoMock.save.mockImplementation(account => Promise.resolve(account as OrganizationCreditAccount))

            const result = await store.setBalance('org-1', 7)

            expect(accountRepoMock.create).toHaveBeenCalledWith({ organizationId: 'org-1' })
            expect(result).toBe(7)
        })
    })

    describe('getBalance', () => {
        it('returns the balance when the account exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({
                organizationId: 'org-1',
                balance: 42,
            } as OrganizationCreditAccount)

            await expect(store.getBalance('org-1')).resolves.toBe(42)
        })

        it('returns 0 when no account exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)

            await expect(store.getBalance('org-1')).resolves.toBe(0)
        })
    })
})
