import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExternalIdentityConflictError, ExternalIdentityStore } from '../../application/ports/external-identity-store'
import { ExternalIdentityRecord } from '../../domain/external-identity-record'
import { ExternalIdentity } from './external-identity.entity'

const POSTGRES_UNIQUE_VIOLATION = '23505'

@Injectable()
export class TypeOrmExternalIdentityStore implements ExternalIdentityStore {
    constructor(
        @InjectRepository(ExternalIdentity) private readonly externalIdentityRepo: Repository<ExternalIdentity>,
    ) {}

    async findByIssuerAndSubject(issuer: string, subject: string): Promise<ExternalIdentityRecord | undefined> {
        const entity = await this.externalIdentityRepo.findOne({ where: { issuer, subject } })
        return entity ? toRecord(entity) : undefined
    }

    async updateEmail(existing: ExternalIdentityRecord, email: string | null): Promise<ExternalIdentityRecord> {
        await this.externalIdentityRepo.update(existing.id, { email })
        return { ...existing, email }
    }

    async create(issuer: string, subject: string, email: string | null): Promise<ExternalIdentityRecord> {
        try {
            const created = await this.externalIdentityRepo.save(
                this.externalIdentityRepo.create({ issuer, subject, email }),
            )
            return toRecord(created)
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                throw new ExternalIdentityConflictError(issuer, subject)
            }
            throw error
        }
    }

    private isUniqueViolation(error: unknown): boolean {
        return typeof error === 'object' && error !== null && (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    }
}

function toRecord(entity: ExternalIdentity): ExternalIdentityRecord {
    return { id: entity.id, issuer: entity.issuer, subject: entity.subject, email: entity.email }
}
