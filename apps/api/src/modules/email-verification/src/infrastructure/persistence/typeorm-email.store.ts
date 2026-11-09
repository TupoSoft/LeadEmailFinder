import { Repository } from 'typeorm'
import { Email, EmailUpdate } from '../../domain/email'
import { EmailStore, NewEmail } from '../../application/ports/email-store'
import { EmailEntity } from './typeorm/email.entity'

function toRecord(entity: EmailEntity): Email {
    return {
        organizationId: entity.organizationId,
        id: entity.id,
        username: entity.username,
        domain: entity.domain,
        exists: entity.exists,
        format: entity.format,
        lastVerificationId: entity.lastVerificationId,
        lastVerifiedAt: entity.lastVerifiedAt,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}

function applyUpdate(entity: EmailEntity, { format, exists, lastVerificationId }: EmailUpdate): void {
    if (format !== undefined) {
        entity.format = format
    }

    if (exists !== undefined) {
        entity.exists = exists
    }

    if (lastVerificationId !== undefined) {
        entity.lastVerificationId = lastVerificationId
    }
}

export class TypeOrmEmailStore implements EmailStore {
    constructor(private readonly repository: Repository<EmailEntity>) {}

    async findByAddress(organizationId: string, address: string): Promise<Email | null> {
        const entity = await this.repository.findOneBy({ organizationId, id: address })
        return entity === null ? null : toRecord(entity)
    }

    async findAllForOrganization(organizationId: string): Promise<Email[]> {
        const entities = await this.repository.find({ where: { organizationId } })
        return entities.map(toRecord)
    }

    async create(organizationId: string, { id, exists, format }: NewEmail): Promise<Email> {
        const [username, domain] = id.split('@')
        const saved = await this.repository.save(
            this.repository.create({ organizationId, id, username, domain, exists, format }),
        )
        return toRecord(saved)
    }

    async update(organizationId: string, address: string, changes: EmailUpdate): Promise<Email | null> {
        const entity = await this.repository.findOneBy({ organizationId, id: address })

        if (entity === null) {
            return null
        }

        applyUpdate(entity, changes)
        return toRecord(await this.repository.save(entity))
    }

    async upsert(organizationId: string, address: string, changes: EmailUpdate): Promise<Email> {
        let entity = await this.repository.findOneBy({ organizationId, id: address })

        if (entity === null) {
            const [username, domain] = address.split('@')
            entity = this.repository.create({ organizationId, id: address, username, domain, exists: null })
        }

        applyUpdate(entity, changes)
        return toRecord(await this.repository.save(entity))
    }
}
