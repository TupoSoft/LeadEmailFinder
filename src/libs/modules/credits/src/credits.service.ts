import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CreditDebit, CreditGrant, OrganizationCreditAccount } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientCreditsException } from './credits.error'

@Injectable()
export class CreditsService {
    constructor(
        @InjectRepository(OrganizationCreditAccount)
        private readonly organizationCreditAccountRepo: Repository<OrganizationCreditAccount>,
        private readonly dataSource: DataSource,
    ) {}

    async debit(organizationId: string, amount: number, reference: string): Promise<void> {
        await this.dataSource.transaction(async manager => {
            const account = await manager.findOne(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            if (!account) {
                throw new InsufficientCreditsException(organizationId)
            }

            if (await manager.existsBy(CreditDebit, { organizationId, reference })) {
                return
            }

            if (account.balance < amount) {
                throw new InsufficientCreditsException(organizationId)
            }

            account.balance -= amount
            await manager.save(OrganizationCreditAccount, account)
            await manager.insert(CreditDebit, { organizationId, reference, amount })
        })
    }

    async debitUpTo(organizationId: string, amount: number, reference: string): Promise<number> {
        this.assertNonNegativeInteger(amount)

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
        this.assertNonNegativeInteger(amount)

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
        const account = await this.organizationCreditAccountRepo.findOneBy({ organizationId })
        return account?.balance ?? 0
    }

    async setBalance(organizationId: string, amount: number): Promise<number> {
        const account =
            (await this.organizationCreditAccountRepo.findOneBy({ organizationId })) ??
            this.organizationCreditAccountRepo.create({ organizationId })
        account.balance = amount

        const saved = await this.organizationCreditAccountRepo.save(account)
        return saved.balance
    }

    private assertNonNegativeInteger(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error('Credit amount must be a non-negative safe integer')
        }
    }
}
