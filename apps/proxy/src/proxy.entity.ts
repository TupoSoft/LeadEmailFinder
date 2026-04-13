import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { Protocol } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AutoMap } from '@automapper/classes'

@Entity('proxy_registry')
export class Proxy {
    @PrimaryGeneratedColumn('uuid')
    @AutoMap()
    id: string

    @Column({ type: 'int' })
    @AutoMap()
    protocol: Protocol

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

    @CreateDateColumn()
    @AutoMap()
    createdAt: Date

    @UpdateDateColumn()
    @AutoMap()
    updatedAt: Date
}
