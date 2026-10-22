import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from './better-auth-schema'

const columns = BETTER_AUTH_COLUMNS.verification

@Entity(BETTER_AUTH_TABLES.verification)
@Index('IDX_better_auth_verifications_identifier', ['identifier'])
export class BetterAuthVerificationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ name: columns.identifier, type: 'text' })
    identifier: string

    @Column({ name: columns.value, type: 'text' })
    value: string

    @Column({ name: columns.expiresAt, type: 'timestamptz' })
    expiresAt: Date

    @Column({ name: columns.createdAt, type: 'timestamptz' })
    createdAt: Date

    @Column({ name: columns.updatedAt, type: 'timestamptz' })
    updatedAt: Date
}
