import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExternalIdentity } from '@tuposoft/lead-email-finder/modules/identity'

const POSTGRES_UNIQUE_VIOLATION = '23505'

@Injectable()
export class HumanIdentityResolver {
    constructor(
        @InjectRepository(ExternalIdentity) private readonly externalIdentityRepo: Repository<ExternalIdentity>,
    ) {}

    async resolveOrCreate(issuer: string, subject: string, email: string | null): Promise<ExternalIdentity> {
        const existing = await this.externalIdentityRepo.findOne({ where: { issuer, subject } })

        if (existing) {
            if (existing.email !== email) {
                existing.email = email
                return this.externalIdentityRepo.save(existing)
            }
            return existing
        }

        try {
            return await this.externalIdentityRepo.save(this.externalIdentityRepo.create({ issuer, subject, email }))
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                const raced = await this.externalIdentityRepo.findOne({ where: { issuer, subject } })
                if (raced) {
                    return raced
                }
            }
            throw error
        }
    }

    private isUniqueViolation(error: unknown): boolean {
        return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION
    }
}
