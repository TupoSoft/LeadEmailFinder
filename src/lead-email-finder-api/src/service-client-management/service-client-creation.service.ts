import { randomUUID } from 'node:crypto'
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { AuditLogEntry, AuthPermission, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { KEYCLOAK_SERVICE_CLIENT_ADMIN, KeycloakServiceClientAdmin } from './keycloak-service-client-admin'

export interface ServiceClientCreationResult {
    readonly credential: ServiceCredential
    readonly secret: string
}

@Injectable()
export class ServiceClientCreationService {
    constructor(
        private readonly dataSource: DataSource,
        @Inject(KEYCLOAK_SERVICE_CLIENT_ADMIN) private readonly keycloakAdmin: KeycloakServiceClientAdmin,
        private readonly configService: ConfigService,
        private readonly rolePermissionPolicy: RolePermissionPolicy,
    ) {}

    async create(
        actor: AuthPrincipal,
        organizationId: string,
        description: string | null,
        permissions: AuthPermission[],
    ): Promise<ServiceClientCreationResult> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ForbiddenException('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may create service clients')
        }

        const allowedPermissions = this.rolePermissionPolicy.effectivePermissionsFor(actor)
        const excessPermissions = permissions.filter(permission => !allowedPermissions.includes(permission))
        if (excessPermissions.length > 0) {
            throw new BadRequestException(
                `Cannot grant permissions beyond the actor's own: ${excessPermissions.join(', ')}`,
            )
        }

        const issuer = this.configService.getOrThrow<string>('OIDC_ISSUER_URL')
        const id = randomUUID()
        const keycloakClientId = `lef-svc-${id}`

        const { subject, secret } = await this.keycloakAdmin.provisionClient({ keycloakClientId, description })

        const credential = await this.dataSource.transaction(async manager => {
            const credential = await manager.save(
                ServiceCredential,
                manager.create(ServiceCredential, {
                    id,
                    organizationId,
                    issuer,
                    subject,
                    keycloakClientId,
                    description,
                    permissions,
                    status: 'active',
                }),
            )

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.created',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
                metadata: { permissions },
            })

            return credential
        })

        return { credential, secret }
    }
}
