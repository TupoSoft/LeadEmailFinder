import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('credits')
export class Credit {
    @PrimaryColumn()
    token: string

    @Column({ type: 'integer', default: 0 })
    balance: number

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
