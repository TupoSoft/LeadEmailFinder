import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm'
import { CreditDebit } from './credit-debit.entity'
import { CreditGrant } from './credit-grant.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { TypeOrmCreditLedgerStore } from './typeorm-credit-ledger-store'

type InsertMock = Record<'insert' | 'into' | 'values' | 'onConflict' | 'execute', jest.Mock>

function createInsertMock(): InsertMock {
    return {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: [] }),
    }
}

describe('TypeOrmCreditLedgerStore', () => {
    let store: TypeOrmCreditLedgerStore
    let accountRepoMock: jest.Mocked<Pick<Repository<OrganizationCreditAccount>, 'findOneBy' | 'save' | 'create'>>
    let managerMock: jest.Mocked<
        Pick<EntityManager, 'findOne' | 'findOneOrFail' | 'existsBy' | 'save' | 'insert' | 'createQueryBuilder'>
    >
    let dataSourceMock: { transaction: jest.Mock }
    let accountInsertMock: ReturnType<typeof createInsertMock>

    beforeEach(() => {
        managerMock = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            existsBy: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
            createQueryBuilder: jest.fn(),
        }
        accountInsertMock = createInsertMock()
        managerMock.createQueryBuilder.mockReturnValue(
            accountInsertMock as unknown as ReturnType<EntityManager['createQueryBuilder']>,
        )
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
            managerMock.findOne.mockResolvedValue({
                organizationId,
                balance: 10,
                reserved: 0,
            })
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
            managerMock.findOne.mockResolvedValue({
                organizationId,
                balance: 1,
                reserved: 0,
            })
            managerMock.existsBy.mockResolvedValue(false)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('insufficient-balance')

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('reports insufficient-balance when reserved credits make the raw balance unavailable', async () => {
            managerMock.findOne.mockResolvedValue({
                organizationId,
                balance: 5,
                reserved: 3,
            })
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
            managerMock.findOne.mockResolvedValue({
                organizationId,
                balance: 10,
                reserved: 0,
            })
            managerMock.existsBy.mockResolvedValue(true)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('replayed')

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('reports replayed even when a replayed reference is now below the required balance', async () => {
            managerMock.findOne.mockResolvedValue({
                organizationId,
                balance: 1,
                reserved: 0,
            })
            managerMock.existsBy.mockResolvedValue(true)

            await expect(store.debit(organizationId, 3, 'ref-1')).resolves.toBe('replayed')
        })
    })

    describe('credit', () => {
        it('creates and locks a zero-balance account before applying the first grant', async () => {
            managerMock.findOne.mockResolvedValue(null)
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 0,
            })
            managerMock.save.mockResolvedValue({ organizationId: 'org-1', balance: 5 })

            const result = await store.credit('org-1', 5, 'ref-1')

            expect(accountInsertMock.into).toHaveBeenCalledWith(OrganizationCreditAccount)
            expect(accountInsertMock.values).toHaveBeenCalledWith({ organizationId: 'org-1', balance: 0, reserved: 0 })
            expect(accountInsertMock.onConflict).toHaveBeenCalledWith('("organizationId") DO NOTHING')
            expect(managerMock.findOneOrFail).toHaveBeenCalledWith(OrganizationCreditAccount, {
                where: { organizationId: 'org-1' },
                lock: { mode: 'pessimistic_write' },
            })
            expect(accountInsertMock.execute.mock.invocationCallOrder[0]).toBeLessThan(
                managerMock.findOneOrFail.mock.invocationCallOrder[0],
            )
            expect(managerMock.findOneOrFail.mock.invocationCallOrder[0]).toBeLessThan(
                managerMock.insert.mock.invocationCallOrder[0],
            )
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ organizationId: 'org-1', balance: 5 }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(CreditGrant, {
                organizationId: 'org-1',
                reference: 'ref-1',
                amount: 5,
            })
            expect(managerMock.insert.mock.invocationCallOrder[0]).toBeLessThan(
                managerMock.save.mock.invocationCallOrder[0],
            )
            expect(result).toEqual({ disposition: 'inserted', recordedAmount: 5, balance: 5 })
            expect(Object.isFrozen(result)).toBe(true)
        })

        it('increments the locked existing balance without resetting it during account creation', async () => {
            accountInsertMock.execute.mockResolvedValue({ raw: [] })
            managerMock.findOne.mockResolvedValue(null)
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
            })
            managerMock.save.mockImplementation((_entity, account) =>
                Promise.resolve(account as OrganizationCreditAccount),
            )

            const result = await store.credit('org-1', 5, 'ref-1')

            expect(result).toEqual({ disposition: 'inserted', recordedAmount: 5, balance: 15 })
        })

        it.each([5, 20])('reports the recorded amount and current balance for a replay requesting %i', async amount => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
            })
            managerMock.findOne.mockResolvedValue({ amount: 5 })

            const result = await store.credit('org-1', amount, 'ref-1')

            expect(result).toEqual({ disposition: 'existing', recordedAmount: 5, balance: 10 })
            expect(Object.isFrozen(result)).toBe(true)
            expect(managerMock.findOne).toHaveBeenCalledWith(CreditGrant, {
                where: { organizationId: 'org-1', reference: 'ref-1' },
            })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('propagates an unexpected duplicate grant error without changing the balance or reading a winner', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 12,
            })
            managerMock.findOne.mockResolvedValue(null)
            const failure = new QueryFailedError(
                'INSERT INTO credit_grants',
                [],
                Object.assign(new Error('duplicate grant'), { code: '23505' }),
            )
            managerMock.insert.mockRejectedValue(failure)

            await expect(store.credit('org-1', 5, 'ref-1')).rejects.toBe(failure)

            expect(managerMock.findOne).toHaveBeenCalledTimes(1)
            expect(managerMock.findOneOrFail).toHaveBeenCalledTimes(1)
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('propagates unexpected grant failures without applying a balance or reporting a replay', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
            })
            managerMock.findOne.mockResolvedValue(null)
            const failure = new Error('database unavailable')
            managerMock.insert.mockRejectedValue(failure)

            await expect(store.credit('org-1', 5, 'ref-1')).rejects.toBe(failure)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.findOneOrFail).toHaveBeenCalledTimes(1)
        })
    })

    describe('debitUpTo', () => {
        it('clamps to the available balance and returns the amount persisted in the ledger', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 3 })
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
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 0 })
                .mockResolvedValueOnce(null)

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(0)
            expect(managerMock.insert).toHaveBeenCalledWith(CreditDebit, {
                organizationId: 'org-1',
                reference: 'adjustment-1',
                amount: 0,
            })

            jest.clearAllMocks()
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 20 })
                .mockResolvedValueOnce({ amount: 0 })

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(0)
            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('returns the originally applied amount for a nonzero replay', async () => {
            managerMock.findOne
                .mockResolvedValueOnce({ organizationId: 'org-1', balance: 50 })
                .mockResolvedValueOnce({ amount: 7 })

            await expect(store.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(7)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('creditOnce', () => {
        it('credits the account and reports the applied operation amount', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 3,
            })
            managerMock.findOne.mockResolvedValue(null)
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
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
            })
            managerMock.findOne.mockResolvedValue({ amount: 7 })

            await expect(store.creditOnce('org-1', 9, 'restore-1')).resolves.toBe(7)

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })
    })

    describe('setBalance', () => {
        it('inserts an absent account before locking, then sets its balance under the shared lock discipline', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
                reserved: 0,
            })
            managerMock.save.mockImplementation((_entity, account) =>
                Promise.resolve(account as OrganizationCreditAccount),
            )

            await expect(store.setBalance('org-1', 7)).resolves.toEqual({ kind: 'applied', balance: 7 })

            expect(accountInsertMock.into).toHaveBeenCalledWith(OrganizationCreditAccount)
            expect(accountInsertMock.values).toHaveBeenCalledWith({ organizationId: 'org-1', balance: 0, reserved: 0 })
            expect(managerMock.findOneOrFail).toHaveBeenCalledWith(OrganizationCreditAccount, {
                where: { organizationId: 'org-1' },
                lock: { mode: 'pessimistic_write' },
            })
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 7 }),
            )
        })

        it('rejects a target below reserved credits without writing', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
                reserved: 4,
            })

            await expect(store.setBalance('org-1', 3)).resolves.toEqual({ kind: 'below-reserved' })

            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('accepts a target exactly equal to reserved credits', async () => {
            managerMock.findOneOrFail.mockResolvedValue({
                organizationId: 'org-1',
                balance: 10,
                reserved: 4,
            })
            managerMock.save.mockImplementation((_entity, account) =>
                Promise.resolve(account as OrganizationCreditAccount),
            )

            await expect(store.setBalance('org-1', 4)).resolves.toEqual({ kind: 'applied', balance: 4 })
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

    describe('getBalanceSnapshot', () => {
        it('reads balance and reserved from one consistent account row', async () => {
            accountRepoMock.findOneBy.mockResolvedValue({
                organizationId: 'org-1',
                balance: 42,
                reserved: 9,
            } as OrganizationCreditAccount)

            await expect(store.getBalanceSnapshot('org-1')).resolves.toEqual({ balance: 42, reserved: 9 })
        })

        it('returns zeros when no account exists', async () => {
            accountRepoMock.findOneBy.mockResolvedValue(null)

            await expect(store.getBalanceSnapshot('org-1')).resolves.toEqual({ balance: 0, reserved: 0 })
        })
    })
})
