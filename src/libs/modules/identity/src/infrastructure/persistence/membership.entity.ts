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
import { AUTH_ROLES, AuthRole } from '../../domain/auth-principal'
import { MEMBERSHIP_STATUSES, MembershipStatus } from '../../domain/membership-status'
import { ExternalIdentity } from './external-identity.entity'
import { Organization } from './organization.entity'

@Entity('organization_memberships')
@Index('UQ_organization_memberships_org_identity', ['organizationId', 'externalIdentityId'], { unique: true })
export class OrganizationMembership {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @Column({ type: 'uuid' })
    externalIdentityId: string

    @ManyToOne(() => ExternalIdentity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'externalIdentityId' })
    externalIdentity: ExternalIdentity

    @Column({ type: 'enum', enum: AUTH_ROLES, enumName: 'auth_role' })
    role: AuthRole

    @Column({ type: 'enum', enum: MEMBERSHIP_STATUSES, enumName: 'membership_status', default: 'active' })
    status: MembershipStatus

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
