import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { KeyPermissions } from '../domain/key.enum'

@Entity('keys')
export class Key {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ unique: true })
    @Index()
    token: string

    @Column({ type: 'simple-array' })
    permissions: KeyPermissions[]

    @Column({ nullable: true })
    description: string

    @Column()
    expiresAt: Date

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
