import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { AutoMap } from '@automapper/classes'
import { ProxyLifecycle, ProxyProtocol } from './proxy.dto'

@Entity('proxy_registry')
export class Proxy {
    @PrimaryGeneratedColumn('uuid')
    @AutoMap()
    id: string

    @Column({ type: 'int' })
    @AutoMap()
    protocol: ProxyProtocol

    @Column()
    @AutoMap()
    host: string

    @Column()
    @AutoMap()
    port: number

    @Column({ type: 'jsonb', nullable: true })
    @AutoMap()
    auth?: { user: string; pass: string }

    @Column({ type: 'enum', enum: ProxyLifecycle, default: ProxyLifecycle.DISABLED })
    @AutoMap()
    state: ProxyLifecycle

    @Column({ default: 1 })
    @AutoMap()
    weight: number

    @Column({ default: 1 })
    @AutoMap()
    maxConcurrent: number

    @Column({ default: 10 })
    @AutoMap()
    requestsPerMinute: number

    @Column({ nullable: true })
    @AutoMap()
    description?: string

    @Column('text', { array: true, nullable: true })
    blacklists?: string[]

    @CreateDateColumn()
    @AutoMap()
    createdAt: Date

    @UpdateDateColumn()
    @AutoMap()
    updatedAt: Date
}
