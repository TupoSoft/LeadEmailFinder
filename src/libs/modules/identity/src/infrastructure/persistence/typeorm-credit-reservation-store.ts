import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager, In } from 'typeorm'
import {
    CreditReservationAdmission,
    CreditReservationAdmissionOutcome,
    CreditReservationClosureOutcome,
    CreditReservationItem,
    CreditReservationRecord,
    CreditReservationSettlement,
    CreditReservationSettlementOutcome,
    CreditReservationStore,
} from '../../application/ports/credit-reservation-store'
import { CreditDebit } from './credit-debit.entity'
import { CreditReservation } from './credit-reservation.entity'
import { insertAccountIfAbsent, lockAccount } from './lock-credit-account'
import { OrganizationCreditAccount } from './organization-credit-account.entity'

function toRecord(reservation: CreditReservation): CreditReservationRecord {
    return {
        operationId: reservation.operationId,
        amount: reservation.amount,
        state: reservation.state,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
        settledAt: reservation.settledAt,
    }
}

function toAdmission(
    reservation: CreditReservation,
    disposition: CreditReservationAdmission['disposition'],
): CreditReservationAdmission {
    return { ...toRecord(reservation), disposition }
}

function toSettlement(
    reservation: CreditReservation,
    disposition: CreditReservationSettlement['disposition'],
): CreditReservationSettlement {
    return { ...toRecord(reservation), disposition }
}

async function findByOperationIds(
    manager: EntityManager,
    organizationId: string,
    operationIds: readonly string[],
): Promise<Map<string, CreditReservation>> {
    const rows = await manager.findBy(CreditReservation, { organizationId, operationId: In(operationIds) })
    return new Map(rows.map(row => [row.operationId, row]))
}

@Injectable()
export class TypeOrmCreditReservationStore implements CreditReservationStore {
    constructor(private readonly dataSource: DataSource) {}

    async reserveMany(
        organizationId: string,
        items: readonly CreditReservationItem[],
    ): Promise<CreditReservationAdmissionOutcome> {
        return this.dataSource.transaction(async manager => {
            await insertAccountIfAbsent(manager, organizationId)
            const account = await lockAccount(manager, organizationId)
            const operationIds = items.map(item => item.operationId)
            const existingByOperationId = await findByOperationIds(manager, organizationId, operationIds)

            for (const item of items) {
                const existing = existingByOperationId.get(item.operationId)
                if (existing && existing.amount !== item.amount) {
                    return { kind: 'amount-conflict', operationId: item.operationId }
                }
            }

            const missing = items.filter(item => !existingByOperationId.has(item.operationId))
            const neededTotal = missing.reduce((sum, item) => sum + item.amount, 0)
            const available = account.balance - account.reserved
            if (neededTotal > available) {
                return { kind: 'insufficient-balance' }
            }

            if (missing.length > 0) {
                await manager.insert(
                    CreditReservation,
                    missing.map(item => ({
                        organizationId,
                        operationId: item.operationId,
                        amount: item.amount,
                        state: 'reserved' as const,
                    })),
                )
                account.reserved += neededTotal
                await manager.save(OrganizationCreditAccount, account)
            }

            const finalByOperationId = await findByOperationIds(manager, organizationId, operationIds)
            const reservations = items.map(item => {
                const row = finalByOperationId.get(item.operationId)
                /* v8 ignore next */
                if (!row) throw new Error('credit_reservation_missing_after_admission')
                const disposition = existingByOperationId.has(item.operationId) ? 'existing' : 'inserted'
                return toAdmission(row, disposition)
            })
            return { kind: 'admitted', reservations }
        })
    }

    async getReservation(organizationId: string, operationId: string): Promise<CreditReservationRecord | null> {
        const reservation = await this.dataSource.manager.findOneBy(CreditReservation, { organizationId, operationId })
        return reservation ? toRecord(reservation) : null
    }

    async capture(organizationId: string, operationId: string): Promise<CreditReservationSettlementOutcome> {
        return this.dataSource.transaction(async manager => {
            const account = await lockAccount(manager, organizationId)
            const reservation = await manager.findOne(CreditReservation, { where: { organizationId, operationId } })
            if (!reservation) return { kind: 'missing' }

            if (reservation.state === 'captured') {
                return { kind: 'settled', reservation: toSettlement(reservation, 'replayed') }
            }
            if (reservation.state === 'released') {
                return { kind: 'conflict' }
            }

            const debitReference = `verification-reservation:${operationId}`
            const existingDebit = await manager.findOne(CreditDebit, {
                where: { organizationId, reference: debitReference },
            })
            // An unexpected preexisting debit under this reference means capture never recorded it; treat as a
            // conflict rather than silently claiming success over an inconsistent state.
            if (existingDebit) return { kind: 'conflict' }

            account.balance -= reservation.amount
            account.reserved -= reservation.amount
            await manager.save(OrganizationCreditAccount, account)
            await manager.insert(CreditDebit, { organizationId, reference: debitReference, amount: reservation.amount })

            reservation.state = 'captured'
            reservation.settledAt = new Date()
            const saved = await manager.save(CreditReservation, reservation)
            return { kind: 'settled', reservation: toSettlement(saved, 'applied') }
        })
    }

    async release(organizationId: string, operationId: string): Promise<CreditReservationSettlementOutcome> {
        return this.dataSource.transaction(async manager => {
            const account = await lockAccount(manager, organizationId)
            const reservation = await manager.findOne(CreditReservation, { where: { organizationId, operationId } })
            if (!reservation) return { kind: 'missing' }

            if (reservation.state === 'released') {
                return { kind: 'settled', reservation: toSettlement(reservation, 'replayed') }
            }
            if (reservation.state === 'captured') {
                return { kind: 'conflict' }
            }

            account.reserved -= reservation.amount
            await manager.save(OrganizationCreditAccount, account)

            reservation.state = 'released'
            reservation.settledAt = new Date()
            const saved = await manager.save(CreditReservation, reservation)
            return { kind: 'settled', reservation: toSettlement(saved, 'applied') }
        })
    }

    async closeAdmissionMany(
        organizationId: string,
        items: readonly CreditReservationItem[],
    ): Promise<CreditReservationClosureOutcome> {
        return this.dataSource.transaction(async manager => {
            await insertAccountIfAbsent(manager, organizationId)
            const account = await lockAccount(manager, organizationId)
            const operationIds = items.map(item => item.operationId)
            const existingByOperationId = await findByOperationIds(manager, organizationId, operationIds)

            // Inspect the complete list before changing any row.
            for (const item of items) {
                const existing = existingByOperationId.get(item.operationId)
                if (!existing) continue
                if (existing.state === 'captured') return { kind: 'already-captured', operationId: item.operationId }
                if (existing.amount !== item.amount) return { kind: 'amount-conflict', operationId: item.operationId }
            }

            // Snapshot original states before any mutation: `existingByOperationId` holds live references that
            // the release loop below mutates in place, so disposition must not be read from it afterward.
            const originalStates = new Map(
                items.map(item => [item.operationId, existingByOperationId.get(item.operationId)?.state]),
            )

            const toInsert: Array<
                Pick<CreditReservation, 'organizationId' | 'operationId' | 'amount' | 'state' | 'settledAt'>
            > = []
            const toRelease: CreditReservation[] = []
            let releasedReservedTotal = 0

            for (const item of items) {
                const existing = existingByOperationId.get(item.operationId)
                if (!existing) {
                    toInsert.push({
                        organizationId,
                        operationId: item.operationId,
                        amount: item.amount,
                        state: 'released',
                        settledAt: new Date(),
                    })
                } else if (existing.state === 'reserved') {
                    releasedReservedTotal += existing.amount
                    existing.state = 'released'
                    existing.settledAt = new Date()
                    toRelease.push(existing)
                }
                // An existing 'released' row needs no change; it will be reported as a replay below.
            }

            if (toInsert.length > 0) await manager.insert(CreditReservation, toInsert)
            for (const reservation of toRelease) await manager.save(CreditReservation, reservation)
            if (releasedReservedTotal > 0) {
                account.reserved -= releasedReservedTotal
                await manager.save(OrganizationCreditAccount, account)
            }

            const finalByOperationId = await findByOperationIds(manager, organizationId, operationIds)
            const reservations = items.map(item => {
                const row = finalByOperationId.get(item.operationId)
                /* v8 ignore next */
                if (!row) throw new Error('credit_reservation_missing_after_closure')
                const disposition = originalStates.get(item.operationId) === 'released' ? 'replayed' : 'applied'
                return toSettlement(row, disposition)
            })
            return { kind: 'closed', reservations }
        })
    }
}
