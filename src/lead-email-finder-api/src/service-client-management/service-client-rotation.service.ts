import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { KEYCLOAK_SERVICE_CLIENT_ADMIN, KeycloakServiceClientAdmin } from './keycloak-service-client-admin'

export interface ServiceClientRotationResult {
    readonly credential: ServiceCredential
    readonly secret: string
}

@Injectable()
export class ServiceClientRotationService {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
        private readonly dataSource: DataSource,
        @Inject(KEYCLOAK_SERVICE_CLIENT_ADMIN) private readonly keycloakAdmin: KeycloakServiceClientAdmin,
    ) {}

    async rotate(
        actor: AuthPrincipal,
        organizationId: string,
        serviceClientId: string,
    ): Promise<ServiceClientRotationResult> {
        if (actor.organizationId !== organizationId) {
            throw new NotFoundException('Service client not found')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ForbiddenException('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may rotate service clients')
        }

        const credential = await this.serviceCredentialRepo.findOneBy({ id: serviceClientId, organizationId })
        if (!credential) {
            throw new NotFoundException('Service client not found')
        }
        if (credential.status === 'disabled') {
            throw new ConflictException('Cannot rotate a disabled service client')
        }

        const secret = await this.keycloakAdmin.rotateSecret(credential.keycloakClientId)

        const updated = await this.dataSource.transaction(async manager => {
            const updated = await manager.save(ServiceCredential, credential)

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.rotated',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })

            return updated
        })

        return { credential: updated, secret }
    }
}
