import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import {
    CreditDebitOutcome,
    CreditGrantPersistenceResult,
    CreditLedgerStore,
} from '../../application/ports/credit-ledger-store'
import { CreditDebit } from './credit-debit.entity'
import { CreditGrant } from './credit-grant.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'

@Injectable()
export class TypeOrmCreditLedgerStore implements CreditLedgerStore {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(OrganizationCreditAccount)
        private readonly accountRepo: Repository<OrganizationCreditAccount>,
    ) {}

    async debit(organizationId: string, amount: number, reference: string): Promise<CreditDebitOutcome> {
        return this.dataSource.transaction(async manager => {
            const account = await manager.findOne(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            if (!account) {
                return 'account-missing'
            }

            if (await manager.existsBy(CreditDebit, { organizationId, reference })) {
                return 'replayed'
            }

            if (account.balance < amount) {
                return 'insufficient-balance'
            }

            account.balance -= amount
            await manager.save(OrganizationCreditAccount, account)
            await manager.insert(CreditDebit, { organizationId, reference, amount })
            return 'applied'
        })
    }

    async debitUpTo(organizationId: string, amount: number, reference: string): Promise<number> {
        return this.dataSource.transaction(async manager => {
            const account = await manager.findOne(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            const existing = await manager.findOne(CreditDebit, { where: { organizationId, reference } })
            if (existing) return existing.amount

            const applied = Math.min(account?.balance ?? 0, amount)
            if (account && applied > 0) {
                account.balance -= applied
                await manager.save(OrganizationCreditAccount, account)
            }
            await manager.insert(CreditDebit, { organizationId, reference, amount: applied })
            return applied
        })
    }

    async credit(organizationId: string, amount: number, reference: string): Promise<CreditGrantPersistenceResult> {
        return this.dataSource.transaction(async manager => {
            // Persist before locking: an absent row cannot serialize concurrent first grants.
            await manager
                .createQueryBuilder()
                .insert()
                .into(OrganizationCreditAccount)
                .values({ organizationId, balance: 0 })
                .onConflict('("organizationId") DO NOTHING')
                .execute()
            const account = await manager.findOneOrFail(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            const existing = await manager.findOne(CreditGrant, { where: { organizationId, reference } })

            if (existing) {
                return Object.freeze({
                    disposition: 'existing',
                    recordedAmount: existing.amount,
                    balance: account.balance,
                })
            }

            const inserted = await manager
                .createQueryBuilder()
                .insert()
                .into(CreditGrant)
                .values({ organizationId, reference, amount })
                .onConflict('("organizationId", "reference") DO NOTHING')
                .returning(['amount'])
                .execute()

            if ((inserted.raw as unknown[]).length === 0) {
                // Only the reference conflict is ignored; unrelated database failures still abort the transaction.
                const winner = await manager.findOneOrFail(CreditGrant, { where: { organizationId, reference } })
                return Object.freeze({
                    disposition: 'existing',
                    recordedAmount: winner.amount,
                    balance: account.balance,
                })
            }

            account.balance += amount
            const saved = await manager.save(OrganizationCreditAccount, account)
            return Object.freeze({ disposition: 'inserted', recordedAmount: amount, balance: saved.balance })
        })
    }

    async creditOnce(organizationId: string, amount: number, reference: string): Promise<number> {
        return (await this.credit(organizationId, amount, reference)).recordedAmount
    }

    async getBalance(organizationId: string): Promise<number> {
        const account = await this.accountRepo.findOneBy({ organizationId })
        return account?.balance ?? 0
    }

    async setBalance(organizationId: string, amount: number): Promise<number> {
        const account =
            (await this.accountRepo.findOneBy({ organizationId })) ?? this.accountRepo.create({ organizationId })
        account.balance = amount

        const saved = await this.accountRepo.save(account)
        return saved.balance
    }
}
