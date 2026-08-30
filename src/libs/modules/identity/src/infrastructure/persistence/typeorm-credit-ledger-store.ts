import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CreditDebitOutcome, CreditLedgerStore } from '../../application/ports/credit-ledger-store'
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

    async credit(organizationId: string, amount: number, reference: string): Promise<number> {
        return this.dataSource.transaction(async manager => {
            const account =
                (await manager.findOne(OrganizationCreditAccount, {
                    where: { organizationId },
                    lock: { mode: 'pessimistic_write' },
                })) ?? Object.assign(new OrganizationCreditAccount(), { organizationId, balance: 0 })

            if (await manager.existsBy(CreditGrant, { organizationId, reference })) {
                return account.balance
            }

            account.balance += amount
            const saved = await manager.save(OrganizationCreditAccount, account)
            await manager.insert(CreditGrant, { organizationId, reference, amount })
            return saved.balance
        })
    }

    async creditOnce(organizationId: string, amount: number, reference: string): Promise<number> {
        return this.dataSource.transaction(async manager => {
            const account =
                (await manager.findOne(OrganizationCreditAccount, {
                    where: { organizationId },
                    lock: { mode: 'pessimistic_write' },
                })) ?? Object.assign(new OrganizationCreditAccount(), { organizationId, balance: 0 })
            const existing = await manager.findOne(CreditGrant, { where: { organizationId, reference } })
            if (existing) return existing.amount

            account.balance += amount
            await manager.save(OrganizationCreditAccount, account)
            await manager.insert(CreditGrant, { organizationId, reference, amount })
            return amount
        })
    }

    async getBalance(organizationId: string): Promise<number> {
        const account = await this.accountRepo.findOneBy({ organizationId })
        return account?.balance ?? 0
    }

    async setBalance(organizationId: string, amount: number): Promise<number> {
        const account = (await this.accountRepo.findOneBy({ organizationId })) ?? this.accountRepo.create({ organizationId })
        account.balance = amount

        const saved = await this.accountRepo.save(account)
        return saved.balance
    }
}
