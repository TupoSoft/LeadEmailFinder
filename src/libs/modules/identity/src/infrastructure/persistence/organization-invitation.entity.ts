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
import { AUTH_CREDENTIAL_KINDS, AUTH_ROLES, AuthCredentialKind, AuthRole } from '../../domain/auth-principal'
import { INVITATION_STATUSES, InvitationStatus } from '../../domain/invitation-status'
import { ExternalIdentity } from './external-identity.entity'
import { Organization } from './organization.entity'

@Entity('organization_invitations')
@Index('UQ_organization_invitations_token_hash', ['tokenHash'], { unique: true })
export class OrganizationInvitation {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @Column()
    email: string

    @Column({ type: 'enum', enum: AUTH_ROLES, enumName: 'auth_role' })
    role: AuthRole

    @Column()
    tokenHash: string

    @Column({ type: 'enum', enum: INVITATION_STATUSES, enumName: 'invitation_status', default: 'pending' })
    status: InvitationStatus

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    acceptedAt: Date | null

    @Column({ type: 'uuid', nullable: true })
    acceptedByExternalIdentityId: string | null

    @ManyToOne(() => ExternalIdentity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'acceptedByExternalIdentityId' })
    acceptedByExternalIdentity: ExternalIdentity | null

    // Denormalized actor snapshot, not an FK: the inviter may be a human_session (ExternalIdentity)
    // or service_client (ServiceCredential) principal, and no single FK target fits.
    @Column({ type: 'enum', enum: AUTH_CREDENTIAL_KINDS, enumName: 'auth_credential_kind' })
    invitedByCredentialKind: AuthCredentialKind

    @Column()
    invitedByIssuer: string

    @Column()
    invitedBySubject: string

    @Column()
    invitedByCredentialId: string

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
