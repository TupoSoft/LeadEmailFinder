import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { ExternalIdentity } from '../infrastructure/persistence/external-identity.entity'

const POSTGRES_UNIQUE_VIOLATION = '23505'

@Injectable()
export class HumanIdentityResolver {
    constructor(
        @InjectRepository(ExternalIdentity) private readonly externalIdentityRepo: Repository<ExternalIdentity>,
    ) {}

    async resolveOrCreate(
        issuer: string,
        subject: string,
        email: string | null,
        manager?: EntityManager,
    ): Promise<ExternalIdentity> {
        const repo = manager ? manager.getRepository(ExternalIdentity) : this.externalIdentityRepo
        const existing = await repo.findOne({ where: { issuer, subject } })

        if (existing) {
            if (existing.email !== email) {
                existing.email = email
                return repo.save(existing)
            }
            return existing
        }

        try {
            return await repo.save(repo.create({ issuer, subject, email }))
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                const raced = await repo.findOne({ where: { issuer, subject } })
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
