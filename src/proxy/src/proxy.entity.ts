import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { AutoMap } from '@automapper/classes'
import { ProxyProtocol } from './proxy.dto'

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

    @Column({ default: 1 })
    @AutoMap()
    weight: number

    @Column({ nullable: true })
    @AutoMap()
    description?: string

    @Column({ default: true })
    @AutoMap()
    enabled: boolean

    @Column('text', { array: true, nullable: true })
    blacklists?: string[]

    @CreateDateColumn()
    @AutoMap()
    createdAt: Date

    @UpdateDateColumn()
    @AutoMap()
    updatedAt: Date
}
