import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { ProxyType } from './proxy-type.enum'
import { AutoMap } from '@automapper/classes'

@Entity('proxies')
export class Proxy {
    @PrimaryGeneratedColumn('uuid')
    @AutoMap()
    id: string

    @Column({ type: 'enum', enum: ProxyType })
    @AutoMap()
    type: ProxyType

    @Column()
    @AutoMap()
    host: string

    @Column()
    @AutoMap()
    port: number

    @Column({ nullable: true })
    @AutoMap()
    user?: string

    @Column({ nullable: true })
    @AutoMap()
    password?: string

    @Column('text', { array: true, nullable: true })
    @AutoMap()
    blacklists?: string[]
}
