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
import { SERVICE_CREDENTIAL_STATUSES, ServiceCredentialStatus } from '../../domain/service-credential-status'
import { Organization } from './organization.entity'

@Entity('service_credentials')
@Index('UQ_service_credentials_issuer_subject', ['issuer', 'subject'], { unique: true })
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

    @Column({ type: 'varchar', nullable: true })
    description: string | null

    @Column({ type: 'text', array: true, default: '{}' })
    scopes: string[]

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
