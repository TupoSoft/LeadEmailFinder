import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class ServiceClientDisablementService {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
        private readonly dataSource: DataSource,
    ) {}

    async disable(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new NotFoundException('Service client not found')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ForbiddenException('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may disable service clients')
        }

        const credential = await this.serviceCredentialRepo.findOneBy({ id: serviceClientId, organizationId })
        if (!credential) {
            throw new NotFoundException('Service client not found')
        }
        if (credential.status === 'disabled') {
            return
        }

        // Deliberately no Keycloak call here: ServiceCredentialResolver already checks local status on every
        // request with no caching, so a disabled credential is rejected on its very next use regardless of
        // JWT validity/expiry. Matches ExecPlan 07's "membership status is authoritative" precedent.
        await this.dataSource.transaction(async manager => {
            credential.status = 'disabled'
            await manager.save(ServiceCredential, credential)

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.disabled',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })
        })
    }
}
