import {
    NativeHumanUserProvisioner,
    NativeUserProvisioningError,
    NativeUserQueryable,
} from './native-human-user-provisioner'

type Row = { id: string; email: string; email_verified: boolean }

function database(...results: Row[][]): jest.Mocked<NativeUserQueryable> {
    const query = jest.fn()
    for (const rows of results) query.mockResolvedValueOnce({ rows })
    return { query } as unknown as jest.Mocked<NativeUserQueryable>
}

const USER: Row = { id: '00000000-0000-4000-8000-000000000001', email: 'person@lef.test', email_verified: false }

describe('NativeHumanUserProvisioner', () => {
    it('creates an unverified passwordless user under the normalized address', async () => {
        const db = database([], [USER])

        await expect(new NativeHumanUserProvisioner(db).ensureUnverifiedByEmail('  Person@LEF.test ')).resolves.toEqual(
            {
                id: USER.id,
                email: USER.email,
                emailVerified: false,
                created: true,
            },
        )
        expect(db.query.mock.calls[0][1]).toEqual(['person@lef.test'])
        const [insert, values] = db.query.mock.calls[1]
        expect(insert).toContain('INSERT INTO better_auth_users')
        expect(insert).toContain('ON CONFLICT (email) DO NOTHING')
        expect(insert).not.toMatch(/better_auth_(accounts|sessions)/)
        expect(values).toEqual(['person@lef.test'])
    })

    it('reuses an existing user without upgrading its verification state', async () => {
        const verified = { ...USER, email_verified: true }
        const db = database([verified])

        await expect(new NativeHumanUserProvisioner(db).ensureUnverifiedByEmail(USER.email)).resolves.toEqual({
            id: USER.id,
            email: USER.email,
            emailVerified: true,
            created: false,
        })
        expect(db.query).toHaveBeenCalledTimes(1)
    })

    it('rereads the concurrent winner after a unique-email race', async () => {
        const db = database([], [], [USER])

        await expect(new NativeHumanUserProvisioner(db).ensureUnverifiedByEmail(USER.email)).resolves.toMatchObject({
            id: USER.id,
            created: false,
        })
    })

    it('fails when the concurrent winner disappears before the reread', async () => {
        await expect(
            new NativeHumanUserProvisioner(database([], [], [])).ensureUnverifiedByEmail(USER.email),
        ).rejects.toEqual(new NativeUserProvisioningError('concurrently-removed'))
    })

    it('refuses case-variant duplicates instead of choosing one', async () => {
        const db = database([USER, { ...USER, id: '00000000-0000-4000-8000-000000000002', email: 'Person@lef.test' }])

        await expect(new NativeHumanUserProvisioner(db).ensureUnverifiedByEmail(USER.email)).rejects.toEqual(
            new NativeUserProvisioningError('ambiguous-email'),
        )
    })

    it.each(['', 'no-at-sign', 'a b@lef.test', 'a@b@c'])(
        'rejects an invalid address without querying (%j)',
        async email => {
            const db = database()
            await expect(new NativeHumanUserProvisioner(db).ensureUnverifiedByEmail(email)).rejects.toEqual(
                new NativeUserProvisioningError('invalid-email'),
            )
            expect(db.query).not.toHaveBeenCalled()
        },
    )
})
