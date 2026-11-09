import { EntityManager } from 'typeorm'
import { OrganizationCreditAccount } from './organization-credit-account.entity'

/**
 * Inserts a zero-balance account if absent, then locks it. An absent row cannot serialize concurrent first
 * mutations, so every account-mutating operation must insert before it locks, in this order, consistently.
 */
export async function insertAccountIfAbsent(manager: EntityManager, organizationId: string): Promise<void> {
    await manager
        .createQueryBuilder()
        .insert()
        .into(OrganizationCreditAccount)
        .values({ organizationId, balance: 0, reserved: 0 })
        .onConflict('("organizationId") DO NOTHING')
        .execute()
}

export async function lockAccount(manager: EntityManager, organizationId: string): Promise<OrganizationCreditAccount> {
    return manager.findOneOrFail(OrganizationCreditAccount, {
        where: { organizationId },
        lock: { mode: 'pessimistic_write' },
    })
}
