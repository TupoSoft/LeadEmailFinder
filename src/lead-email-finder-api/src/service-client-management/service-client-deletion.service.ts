import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { KEYCLOAK_SERVICE_CLIENT_ADMIN, KeycloakServiceClientAdmin } from './keycloak-service-client-admin'

@Injectable()
export class ServiceClientDeletionService {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
        private readonly dataSource: DataSource,
        @Inject(KEYCLOAK_SERVICE_CLIENT_ADMIN) private readonly keycloakAdmin: KeycloakServiceClientAdmin,
    ) {}

    async delete(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ForbiddenException('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may delete service clients')
        }

        const credential = await this.serviceCredentialRepo.findOneBy({ id: serviceClientId, organizationId })
        if (!credential) {
            throw new NotFoundException('Service client not found')
        }

        // Unlike a human Keycloak user (left untouched by membership removal, since the person may need to
        // exist for other memberships), a service client has no purpose beyond this one credential — deleting
        // it here first and treating an already-gone client (404) as success keeps this operation retryable.
        await this.keycloakAdmin.deleteClient(credential.keycloakClientId)

        await this.dataSource.transaction(async manager => {
            await manager.delete(ServiceCredential, { id: credential.id })

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.deleted',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })
        })
    }
}
