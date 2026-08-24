import { ConflictException } from '@nestjs/common'
import { DataSource, QueryRunner } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    ExternalIdentity,
    Organization,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'
import { KeycloakOrganizationAdmin } from './keycloak-organization-admin'
import { MembershipRemovalService } from './membership-removal.service'
import { MembershipRoleChangeService } from './membership-role-change.service'

const postgresUrl = process.env['TEST_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe
const schema = `membership_mutation_${process.pid}`

interface OrganizationFixture {
    readonly organization: Organization
    readonly memberships: readonly [OrganizationMembership, OrganizationMembership]
    readonly actor: AuthPrincipal
}

describeWithPostgres('concurrent final-owner membership mutations', () => {
    let dataSource: DataSource
    let removalService: MembershipRemovalService
    let roleChangeService: MembershipRoleChangeService

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_POSTGRES_URL must select a database whose name ends with _test')
        }

        dataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            schema,
            synchronize: false,
            entities: [Organization, ExternalIdentity, OrganizationMembership, AuditLogEntry],
        })
        await dataSource.initialize()
        await dataSource.query(`CREATE SCHEMA "${schema}"`)
        await dataSource.synchronize()

        const keycloakAdmin: KeycloakOrganizationAdmin = {
            ensureUser: jest.fn(),
            assignRealmRole: jest.fn(),
        }
        removalService = new MembershipRemovalService(dataSource)
        roleChangeService = new MembershipRoleChangeService(dataSource, keycloakAdmin)
    })

    afterAll(async () => {
        if (!dataSource?.isInitialized) return

        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        await dataSource.destroy()
    })

    it('serializes concurrent removals targeting different owners', async () => {
        const fixture = await createOrganizationWithTwoOwners(dataSource, 'removal')

        await expectExactlyOneConflict(
            dataSource,
            fixture,
            ([first, second]) => [
                removalService.remove(fixture.actor, fixture.organization.id, first.id),
                removalService.remove(fixture.actor, fixture.organization.id, second.id),
            ],
            'membership.removed',
        )
    })

    it('serializes concurrent demotions targeting different owners', async () => {
        const fixture = await createOrganizationWithTwoOwners(dataSource, 'demotion')

        await expectExactlyOneConflict(
            dataSource,
            fixture,
            ([first, second]) => [
                roleChangeService.changeRole(fixture.actor, fixture.organization.id, first.id, 'member'),
                roleChangeService.changeRole(fixture.actor, fixture.organization.id, second.id, 'member'),
            ],
            'membership.role_changed',
        )
    })
})

async function createOrganizationWithTwoOwners(dataSource: DataSource, label: string): Promise<OrganizationFixture> {
    const organization = await dataSource.manager.save(
        Organization,
        dataSource.manager.create(Organization, { name: `Concurrency ${label}` }),
    )
    const identities = await dataSource.manager.save(
        ExternalIdentity,
        ['first', 'second'].map(subject =>
            dataSource.manager.create(ExternalIdentity, {
                issuer: 'https://issuer.example.test',
                subject: `${label}-${subject}-${organization.id}`,
                email: `${label}-${subject}@example.test`,
            }),
        ),
    )
    const memberships = await dataSource.manager.save(
        OrganizationMembership,
        identities.map(identity =>
            dataSource.manager.create(OrganizationMembership, {
                organizationId: organization.id,
                externalIdentityId: identity.id,
                role: 'owner',
                status: 'active',
            }),
        ),
    )

    return {
        organization,
        memberships: [memberships[0], memberships[1]],
        actor: {
            credentialKind: 'human_session',
            issuer: 'https://issuer.example.test',
            subject: identities[0].subject,
            organizationId: organization.id,
            membershipRole: 'owner',
            permissions: ['members:manage'],
            credentialId: identities[0].id,
        },
    }
}

async function expectExactlyOneConflict(
    dataSource: DataSource,
    fixture: OrganizationFixture,
    startOperations: (
        memberships: OrganizationFixture['memberships'],
    ) => readonly [Promise<unknown>, Promise<unknown>],
    expectedAuditAction: string,
): Promise<void> {
    const blocker = dataSource.createQueryRunner()
    await lockOrganization(blocker, fixture.organization.id)
    const operations = startOperations(fixture.memberships)

    let waiterError: Error | undefined
    try {
        await waitForOrganizationLockWaiters(dataSource, 2)
    } catch (error) {
        waiterError = error instanceof Error ? error : new Error(String(error))
    } finally {
        await blocker.commitTransaction()
        await blocker.release()
    }

    const results = await Promise.allSettled(operations)
    if (waiterError) throw waiterError

    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter(result => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(ConflictException)

    await expect(
        dataSource.manager.count(OrganizationMembership, {
            where: { organizationId: fixture.organization.id, role: 'owner', status: 'active' },
        }),
    ).resolves.toBe(1)
    await expect(
        dataSource.manager.count(AuditLogEntry, {
            where: { organizationId: fixture.organization.id, action: expectedAuditAction, outcome: 'success' },
        }),
    ).resolves.toBe(1)
}

async function lockOrganization(queryRunner: QueryRunner, organizationId: string): Promise<void> {
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.manager.findOneOrFail(Organization, {
        where: { id: organizationId },
        lock: { mode: 'pessimistic_write' },
    })
}

async function waitForOrganizationLockWaiters(dataSource: DataSource, expectedCount: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const [{ count }] = await dataSource.query<Array<{ count: number }>>(
            `SELECT COUNT(*)::int AS count
             FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query LIKE $1`,
            [`%${schema}%organizations%FOR UPDATE%`],
        )
        if (count >= expectedCount) return

        await new Promise(resolve => setTimeout(resolve, 10))
    }

    throw new Error(`Timed out waiting for ${expectedCount} organization-lock waiters`)
}
