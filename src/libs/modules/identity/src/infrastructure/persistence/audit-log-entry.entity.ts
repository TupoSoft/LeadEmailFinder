import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { AUTH_CREDENTIAL_KINDS, AuthCredentialKind } from '../../domain/auth-principal'
import { AUDIT_OUTCOMES, AuditOutcome } from '../../domain/audit-outcome'
import { Organization } from './organization.entity'

@Entity('audit_log_entries')
@Index('IDX_audit_log_entries_org_created_at', ['organizationId', 'createdAt'])
export class AuditLogEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @Column({ type: 'enum', enum: AUTH_CREDENTIAL_KINDS, enumName: 'auth_credential_kind' })
    actorCredentialKind: AuthCredentialKind

    @Column()
    actorIssuer: string

    @Column()
    actorSubject: string

    @Column()
    actorCredentialId: string

    // Open, growing vocabulary across future plans (e.g. a later plan's client lifecycle actions) — plain
    // varchar, deliberately not a Postgres enum, unlike AuthRole/MembershipStatus which are small closed sets.
    @Column()
    action: string

    @Column()
    targetType: string

    @Column()
    targetId: string

    @Column({ type: 'enum', enum: AUDIT_OUTCOMES, enumName: 'audit_outcome' })
    outcome: AuditOutcome

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date
}
