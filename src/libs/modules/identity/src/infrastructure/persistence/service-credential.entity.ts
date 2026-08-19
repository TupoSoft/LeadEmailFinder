import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm'
import { AUTH_PERMISSIONS, AuthPermission } from '../../domain/auth-principal'
import { SERVICE_CREDENTIAL_STATUSES, ServiceCredentialStatus } from '../../domain/service-credential-status'
import { Organization } from './organization.entity'

@Entity('service_credentials')
@Index('UQ_service_credentials_issuer_subject', ['issuer', 'subject'], { unique: true })
@Index('UQ_service_credentials_issuer_keycloak_client_id', ['issuer', 'keycloakClientId'], { unique: true })
export class ServiceCredential {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @Column()
    issuer: string

    @Column()
    subject: string

    // The literal Keycloak clientId string (e.g. 'lef-svc-<uuid>'), distinct from `subject` (the service-account
    // user UUID). Needed to address /admin/realms/{realm}/clients?clientId= for rotate/delete. Unique per issuer,
    // not globally: the same underlying Keycloak client can legitimately be seeded under more than one issuer
    // (e.g. a dev-only credential reachable as both the host-facing and a container-internal Keycloak hostname).
    @Column()
    keycloakClientId: string

    @Column({ type: 'varchar', nullable: true })
    description: string | null

    @Column({ type: 'enum', enum: AUTH_PERMISSIONS, enumName: 'auth_permission', array: true, default: '{}' })
    permissions: AuthPermission[]

    @Column({
        type: 'enum',
        enum: SERVICE_CREDENTIAL_STATUSES,
        enumName: 'service_credential_status',
        default: 'active',
    })
    status: ServiceCredentialStatus

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
