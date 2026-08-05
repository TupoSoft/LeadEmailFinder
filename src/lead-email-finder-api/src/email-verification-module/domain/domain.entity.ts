import type { MxRecord } from 'node:dns'
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { AutoMap } from '@automapper/classes'

@Entity('domains')
export class Domain {
    @PrimaryColumn('text')
    @AutoMap()
    id: string

    @Column({ type: 'boolean', nullable: true, default: null })
    @AutoMap()
    catchAllEnabled: boolean | null

    @Column({ default: false })
    @AutoMap()
    isFree: boolean

    @Column({ default: false })
    @AutoMap()
    isDisposable: boolean

    @Column({ default: false })
    @AutoMap()
    isVerificationForbidden: boolean

    @Column({ type: 'jsonb', nullable: true })
    @AutoMap()
    mxRecords?: MxRecord[]

    @CreateDateColumn()
    @AutoMap()
    createdAt: Date

    @UpdateDateColumn()
    @AutoMap()
    updatedAt: Date
}
