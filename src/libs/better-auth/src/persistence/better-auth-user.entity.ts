import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from './better-auth-schema'

const columns = BETTER_AUTH_COLUMNS.user

@Entity(BETTER_AUTH_TABLES.user)
@Index('UQ_better_auth_users_email', ['email'], { unique: true })
export class BetterAuthUserEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ name: columns.name, type: 'text' })
    name: string

    @Column({ name: columns.email, type: 'text' })
    email: string

    @Column({ name: columns.emailVerified, type: 'boolean', default: false })
    emailVerified: boolean

    @Column({ name: columns.image, type: 'text', nullable: true })
    image: string | null

    @Column({ name: columns.twoFactorEnabled, type: 'boolean', nullable: true, default: false })
    twoFactorEnabled: boolean | null

    @Column({ name: columns.createdAt, type: 'timestamptz' })
    createdAt: Date

    @Column({ name: columns.updatedAt, type: 'timestamptz' })
    updatedAt: Date
}
