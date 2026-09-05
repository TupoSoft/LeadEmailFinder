import type { MxRecord } from 'node:dns'
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('domains')
export class DomainPolicyEntity {
    @PrimaryColumn('text')
    id: string

    @Column({ type: 'boolean', nullable: true, default: null })
    catchAllEnabled: boolean | null

    @Column({ default: false })
    isFree: boolean

    @Column({ default: false })
    isDisposable: boolean

    @Column({ default: false })
    isVerificationForbidden: boolean

    @Column({ type: 'jsonb', nullable: true })
    mxRecords?: MxRecord[]

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
