import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from './better-auth-schema'
import { BetterAuthUserEntity } from './better-auth-user.entity'

const columns = BETTER_AUTH_COLUMNS.session

@Entity(BETTER_AUTH_TABLES.session)
@Index('UQ_better_auth_sessions_token', ['token'], { unique: true })
@Index('IDX_better_auth_sessions_user_id', ['userId'])
export class BetterAuthSessionEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ name: columns.expiresAt, type: 'timestamptz' })
    expiresAt: Date

    @Column({ name: columns.token, type: 'text' })
    token: string

    @Column({ name: columns.ipAddress, type: 'text', nullable: true })
    ipAddress: string | null

    @Column({ name: columns.userAgent, type: 'text', nullable: true })
    userAgent: string | null

    @Column({ name: columns.userId, type: 'uuid' })
    userId: string

    @ManyToOne(() => BetterAuthUserEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: columns.userId })
    user: BetterAuthUserEntity

    @Column({ name: columns.createdAt, type: 'timestamptz' })
    createdAt: Date

    @Column({ name: columns.updatedAt, type: 'timestamptz' })
    updatedAt: Date
}
