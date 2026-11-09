import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { ProxyLifecycle } from '../../domain/proxy-lifecycle'
import { ProxyProtocol } from '../../domain/proxy-protocol'

@Entity('proxy_registry')
export class Proxy {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'int' })
    protocol: ProxyProtocol

    @Column()
    host: string

    @Column()
    port: number

    @Column({ type: 'jsonb', nullable: true })
    auth?: { user: string; pass: string }

    @Column({ type: 'enum', enum: ProxyLifecycle, default: ProxyLifecycle.DISABLED })
    state: ProxyLifecycle

    @Column({ default: 1 })
    weight: number

    @Column({ default: 1 })
    maxConcurrent: number

    @Column({ default: 10 })
    requestsPerMinute: number

    @Column({ nullable: true })
    description?: string

    @Column('text', { array: true, nullable: true })
    blacklists?: string[]

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
