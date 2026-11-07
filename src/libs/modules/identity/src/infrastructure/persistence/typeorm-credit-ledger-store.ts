import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import {
    CreditBalanceSnapshot,
    CreditDebitOutcome,
    CreditGrantPersistenceResult,
    CreditLedgerStore,
    SetBalanceOutcome,
} from '../../application/ports/credit-ledger-store'
import { CreditDebit } from './credit-debit.entity'
import { CreditGrant } from './credit-grant.entity'
import { insertAccountIfAbsent, lockAccount } from './lock-credit-account'
import { OrganizationCreditAccount } from './organization-credit-account.entity'

@Injectable()
export class TypeOrmCreditLedgerStore implements CreditLedgerStore {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(OrganizationCreditAccount)
        private readonly accountRepo: Repository<OrganizationCreditAccount>,
    ) {}

    async debit(organizationId: string, amount: number, reference: string): Promise<CreditDebitOutcome> {
        // Commit the balance reduction and debit receipt together so neither can persist alone.
        return this.dataSource.transaction(async manager => {
            // Lock the existing account to serialize changes to its balance and reserved credits.
            const account = await manager.findOne(OrganizationCreditAccount, {
                where: { organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            if (!account) {
                return 'account-missing'
            }

            // Check replay before funds: a completed debit stays accepted after the available balance falls.
            if (await manager.existsBy(CreditDebit, { organizationId, reference })) {
                return 'replayed'
            }

            // Reserved credits are already promised to accepted operations and cannot fund this debit.
            if (account.balance - account.reserved < amount) {
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

            // Replays return the amount already charged instead of recalculating it from the current balance.
            if (existing) return existing.amount

            // A missing account has no spendable credit; active reservations remain unavailable.
            const available = Math.max(0, (account?.balance ?? 0) - (account?.reserved ?? 0))

            const applied = Math.min(available, amount)
            if (account && applied > 0) {
                account.balance -= applied
                await manager.save(OrganizationCreditAccount, account)
            }

            // Record even a zero debit so a retry cannot consume a later top-up.
            await manager.insert(CreditDebit, { organizationId, reference, amount: applied })

            return applied
        })
    }

    async credit(organizationId: string, amount: number, reference: string): Promise<CreditGrantPersistenceResult> {
        // Keep the grant record and balance change atomic so neither can commit alone.
        return this.dataSource.transaction(async manager => {
            // Insert before locking: an absent row cannot serialize concurrent first grants.
            await insertAccountIfAbsent(manager, organizationId)

            // Serialize grants for this organization before checking references or changing its balance.
            const account = await lockAccount(manager, organizationId)
            const existing = await manager.findOne(CreditGrant, { where: { organizationId, reference } })

            if (existing) {
                // Replays return the original grant amount and the current balance, without another grant.
                // Callers decide whether requesting a different amount is a conflict.
                return Object.freeze({
                    disposition: 'existing',
                    recordedAmount: existing.amount,
                    balance: account.balance,
                })
            }

            await manager.insert(CreditGrant, { organizationId, reference, amount })

            account.balance += amount

            const saved = await manager.save(OrganizationCreditAccount, account)

            return Object.freeze({ disposition: 'inserted', recordedAmount: amount, balance: saved.balance })
        })
    }

    async creditOnce(organizationId: string, amount: number, reference: string): Promise<number> {
        const { recordedAmount } = await this.credit(organizationId, amount, reference)

        // Return the original grant amount on replay, even if the account balance has changed.
        return recordedAmount
    }

    async getBalance(organizationId: string): Promise<number> {
        const account = await this.accountRepo.findOneBy({ organizationId })

        // An organization without a credit account reads as zero; this does not create an account.
        return account?.balance ?? 0
    }

    async getBalanceSnapshot(organizationId: string): Promise<CreditBalanceSnapshot> {
        // Read both fields from the same row version so the snapshot cannot mix different account states.
        const account = await this.accountRepo.findOneBy({ organizationId })

        return { balance: account?.balance ?? 0, reserved: account?.reserved ?? 0 }
    }

    async setBalance(organizationId: string, amount: number): Promise<SetBalanceOutcome> {
        return this.dataSource.transaction(async manager => {
            // Ensure the account exists before locking its row for the absolute balance replacement.
            await insertAccountIfAbsent(manager, organizationId)

            const account = await lockAccount(manager, organizationId)

            // The replacement balance must still cover credits held for accepted operations.
            if (amount < account.reserved) {
                return { kind: 'below-reserved' }
            }

            account.balance = amount

            const saved = await manager.save(OrganizationCreditAccount, account)

            return { kind: 'applied', balance: saved.balance }
        })
    }
}
