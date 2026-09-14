import { Entity, PrimaryColumn } from 'typeorm'

/** Single-row serialization point for the global execution-permit count-then-insert transaction. Lazily created
 *  on first use via the same optimistic-insert-then-lock idiom `TypeOrmVerificationExecutionStore` already uses
 *  for its address-claim race, since a row cannot be locked before it exists. */
@Entity('verification_execution_permit_locks')
export class VerificationExecutionPermitLockEntity {
    @PrimaryColumn('text')
    id: string
}

export const VERIFICATION_EXECUTION_PERMIT_LOCK_ID = 'global'
