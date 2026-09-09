import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ServiceCredentialDirectory } from '../../application/ports/service-credential-directory'
import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'
import { ServiceCredential } from './service-credential.entity'

@Injectable()
export class TypeOrmServiceCredentialDirectory implements ServiceCredentialDirectory {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
    ) {}

    async listForOrganization(organizationId: string): Promise<readonly ServiceCredentialDetailRecord[]> {
        const credentials = await this.serviceCredentialRepo.find({
            where: { organizationId },
            order: { createdAt: 'DESC', id: 'DESC' },
        })

        return credentials.map(toRecord)
    }

    async findByIdForOrganization(
        id: string,
        organizationId: string,
    ): Promise<ServiceCredentialDetailRecord | undefined> {
        const credential = await this.serviceCredentialRepo.findOneBy({ id, organizationId })
        return credential ? toRecord(credential) : undefined
    }
}

function toRecord(credential: ServiceCredential): ServiceCredentialDetailRecord {
    return {
        id: credential.id,
        organizationId: credential.organizationId,
        issuer: credential.issuer,
        subject: credential.subject,
        keycloakClientId: credential.keycloakClientId,
        description: credential.description,
        permissions: [...credential.permissions],
        status: credential.status,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
    }
}
