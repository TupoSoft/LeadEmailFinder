import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    CreateServiceCredentialCommand,
    ServiceCredentialDeleteOutcome,
    ServiceCredentialDisableOutcome,
    ServiceCredentialRotationOutcome,
    ServiceCredentialWriter,
} from '../../application/ports/service-credential-writer'
import { AuthPrincipal } from '../../domain/auth-principal'
import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { ServiceCredential } from './service-credential.entity'

@Injectable()
export class TypeOrmServiceCredentialWriter implements ServiceCredentialWriter {
    constructor(private readonly dataSource: DataSource) {}

    async createWithAudit(command: CreateServiceCredentialCommand): Promise<ServiceCredentialDetailRecord> {
        const { actor, ...credentialData } = command

        const credential = await this.dataSource.transaction(async manager => {
            const credential = await manager.save(
                ServiceCredential,
                manager.create(ServiceCredential, {
                    ...credentialData,
                    permissions: [...credentialData.permissions],
                    status: 'active',
                }),
            )

            await manager.insert(AuditLogEntry, {
                organizationId: credential.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.created',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
                metadata: { permissions: [...credential.permissions] },
            })

            return credential
        })

        return toRecord(credential)
    }

    async rotateWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialRotationOutcome> {
        return this.dataSource.transaction(async manager => {
            // A full save of the pre-Keycloak snapshot could undo a concurrent disable or recreate a concurrently
            // deleted credential. Update only the rotation timestamp, and let a concurrent disable remain
            // authoritative while preserving the external-first provider ordering.
            const result = await manager.update(
                ServiceCredential,
                { id: credential.id, organizationId: credential.organizationId, status: 'active' },
                { updatedAt: () => 'CURRENT_TIMESTAMP' },
            )

            if (result.affected !== 1) {
                const current = await manager.findOneBy(ServiceCredential, {
                    id: credential.id,
                    organizationId: credential.organizationId,
                })
                return { kind: current?.status === 'disabled' ? 'disabled' : 'not-found' }
            }

            const updated = await manager.findOneBy(ServiceCredential, {
                id: credential.id,
                organizationId: credential.organizationId,
            })
            if (!updated) {
                return { kind: 'not-found' }
            }

            await manager.insert(AuditLogEntry, {
                organizationId: credential.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.rotated',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })

            return { kind: 'rotated', credential: toRecord(updated) }
        })
    }

    async disableWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialDisableOutcome> {
        return this.dataSource.transaction(async manager => {
            const result = await manager.update(
                ServiceCredential,
                { id: credential.id, organizationId: credential.organizationId, status: 'active' },
                { status: 'disabled' },
            )

            if (result.affected !== 1) {
                const current = await manager.findOneBy(ServiceCredential, {
                    id: credential.id,
                    organizationId: credential.organizationId,
                })
                return current?.status === 'disabled' ? 'already-disabled' : 'not-found'
            }

            await manager.insert(AuditLogEntry, {
                organizationId: credential.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.disabled',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })

            return 'disabled'
        })
    }

    async deleteWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialDeleteOutcome> {
        return this.dataSource.transaction(async manager => {
            const result = await manager.delete(ServiceCredential, {
                id: credential.id,
                organizationId: credential.organizationId,
            })
            if (result.affected !== 1) {
                return 'not-found'
            }

            await manager.insert(AuditLogEntry, {
                organizationId: credential.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'service_client.deleted',
                targetType: 'service_credential',
                targetId: credential.id,
                outcome: 'success',
            })

            return 'deleted'
        })
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
