import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ActiveServiceCredentialReader } from '../../application/ports/active-service-credential-reader'
import { ServiceCredentialRecord } from '../../domain/service-credential-record'
import { ServiceCredential } from './service-credential.entity'

@Injectable()
export class TypeOrmActiveServiceCredentialReader implements ActiveServiceCredentialReader {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
    ) {}

    async findByKeyHash(keyHash: string): Promise<ServiceCredentialRecord | undefined> {
        const entity = await this.serviceCredentialRepo.findOne({ where: { keyHash } })
        return entity ? toRecord(entity) : undefined
    }

    async findByIssuerAndSubject(issuer: string, subject: string): Promise<ServiceCredentialRecord | undefined> {
        const entity = await this.serviceCredentialRepo.findOne({ where: { issuer, subject } })
        return entity ? toRecord(entity) : undefined
    }
}

function toRecord(entity: ServiceCredential): ServiceCredentialRecord {
    return {
        id: entity.id,
        organizationId: entity.organizationId,
        issuer: entity.issuer,
        subject: entity.subject,
        keyPrefix: entity.keyPrefix,
        permissions: entity.permissions,
        status: entity.status,
    }
}
