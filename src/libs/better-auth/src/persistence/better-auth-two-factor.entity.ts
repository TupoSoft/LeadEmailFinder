import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from './better-auth-schema'
import { BetterAuthUserEntity } from './better-auth-user.entity'

const columns = BETTER_AUTH_COLUMNS.twoFactor

/** The TOTP secret and recovery codes are stored encrypted by the native plugin with the runtime secret. */
@Entity(BETTER_AUTH_TABLES.twoFactor)
@Index('IDX_better_auth_two_factors_secret', ['secret'])
@Index('IDX_better_auth_two_factors_user_id', ['userId'])
export class BetterAuthTwoFactorEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ name: columns.secret, type: 'text' })
    secret: string

    @Column({ name: columns.backupCodes, type: 'text' })
    backupCodes: string

    @Column({ name: columns.userId, type: 'uuid' })
    userId: string

    // The installed plugin declares this reference without a delete action.
    @ManyToOne(() => BetterAuthUserEntity, { nullable: false })
    @JoinColumn({ name: columns.userId })
    user: BetterAuthUserEntity

    @Column({ name: columns.verified, type: 'boolean', nullable: true, default: true })
    verified: boolean | null

    @Column({ name: columns.failedVerificationCount, type: 'integer', nullable: true, default: 0 })
    failedVerificationCount: number | null

    @Column({ name: columns.lockedUntil, type: 'timestamptz', nullable: true })
    lockedUntil: Date | null
}
