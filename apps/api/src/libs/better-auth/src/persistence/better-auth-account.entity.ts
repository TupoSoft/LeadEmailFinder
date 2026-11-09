import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from './better-auth-schema'
import { BetterAuthUserEntity } from './better-auth-user.entity'

const columns = BETTER_AUTH_COLUMNS.account

@Entity(BETTER_AUTH_TABLES.account)
@Index('IDX_better_auth_accounts_user_id', ['userId'])
export class BetterAuthAccountEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ name: columns.accountId, type: 'text' })
    accountId: string

    @Column({ name: columns.providerId, type: 'text' })
    providerId: string

    @Column({ name: columns.userId, type: 'uuid' })
    userId: string

    @ManyToOne(() => BetterAuthUserEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: columns.userId })
    user: BetterAuthUserEntity

    @Column({ name: columns.accessToken, type: 'text', nullable: true })
    accessToken: string | null

    @Column({ name: columns.refreshToken, type: 'text', nullable: true })
    refreshToken: string | null

    @Column({ name: columns.idToken, type: 'text', nullable: true })
    idToken: string | null

    @Column({ name: columns.accessTokenExpiresAt, type: 'timestamptz', nullable: true })
    accessTokenExpiresAt: Date | null

    @Column({ name: columns.refreshTokenExpiresAt, type: 'timestamptz', nullable: true })
    refreshTokenExpiresAt: Date | null

    @Column({ name: columns.scope, type: 'text', nullable: true })
    scope: string | null

    @Column({ name: columns.password, type: 'text', nullable: true })
    password: string | null

    @Column({ name: columns.createdAt, type: 'timestamptz' })
    createdAt: Date

    @Column({ name: columns.updatedAt, type: 'timestamptz' })
    updatedAt: Date
}
