import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Credit } from './credit.entity'
import { InsufficientCreditsException } from './credits.error'

@Injectable()
export class CreditsService {
    constructor(@InjectRepository(Credit) private readonly creditRepo: Repository<Credit>) {}

    async deductCredit(token: string): Promise<void> {
        return this.deductCredits(token, 1)
    }

    async deductCredits(token: string, count: number): Promise<void> {
        const result = await this.creditRepo
            .createQueryBuilder()
            .update(Credit)
            .set({ balance: () => 'balance - :count' })
            .where('token = :token', { token })
            .andWhere('balance >= :count', { count })
            .setParameters({ token, count })
            .execute()

        if (!result.affected) {
            throw new InsufficientCreditsException(token)
        }
    }

    async addCredits(token: string, amount: number): Promise<number> {
        const credit = (await this.creditRepo.findOneBy({ token })) ?? this.creditRepo.create({ token, balance: 0 })
        credit.balance += amount

        const saved = await this.creditRepo.save(credit)
        return saved.balance
    }

    async getBalance(token: string): Promise<number> {
        const credit = await this.creditRepo.findOneBy({ token })
        return credit?.balance ?? 0
    }

    async setBalance(token: string, amount: number): Promise<number> {
        const credit = (await this.creditRepo.findOneBy({ token })) ?? this.creditRepo.create({ token })
        credit.balance = amount

        const saved = await this.creditRepo.save(credit)
        return saved.balance
    }
}
