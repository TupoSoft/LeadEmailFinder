import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CreditDebit, OrganizationCreditAccount } from '@tuposoft/lead-email-finder/modules/identity'
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

    async addCredits(organizationId: string, amount: number): Promise<number> {
        const account =
            (await this.organizationCreditAccountRepo.findOneBy({ organizationId })) ??
            this.organizationCreditAccountRepo.create({ organizationId, balance: 0 })
        account.balance += amount

        const saved = await this.organizationCreditAccountRepo.save(account)
        return saved.balance
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
}
