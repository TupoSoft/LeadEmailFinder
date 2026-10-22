import {
    NATIVE_FIXTURES,
    NativeFixtureMetadata,
    NativeFixtureSeedDependencies,
    NativeFixtureSeedError,
    parseNativeFixtureMetadata,
    seedNativeFixtures,
} from './native-fixtures'

const ISSUER = 'urn:lead-email-finder:auth'
const ROOT = '/synthetic/checkout'
const input = { checkoutRoot: ROOT, composeProject: 'lef', issuer: ISSUER }

function uuid(prefix: number, index: number): string {
    return `0000000${prefix}-0000-4000-8000-00000000000${index}`
}

interface RecordedStatement {
    text: string
    values: unknown[]
}

function dependencies(overrides: Partial<NativeFixtureSeedDependencies> = {}): {
    deps: NativeFixtureSeedDependencies
    statements: RecordedStatement[]
} {
    const statements: RecordedStatement[] = []
    const users = new Map<string, string>(NATIVE_FIXTURES.map(({ email }, index) => [email, uuid(1, index)]))
    const deps: NativeFixtureSeedDependencies = {
        ensureUnverifiedByEmail: jest.fn((email: string) =>
            Promise.resolve({ id: users.get(email)!, email, emailVerified: false, created: false }),
        ),
        readNativeUser: jest.fn((email: string) => Promise.resolve({ id: users.get(email)!, emailVerified: true })),
        query: jest.fn(<Row extends object>(text: string, values: unknown[]) => {
            statements.push({ text, values })
            if (text.includes('INSERT INTO external_identities')) {
                const index = [...users.values()].indexOf(values[1] as string)
                return Promise.resolve([{ id: uuid(2, index) }] as unknown as Row[])
            }
            return Promise.resolve([] as Row[])
        }) as NativeFixtureSeedDependencies['query'],
        ...overrides,
    }
    return { deps, statements }
}

describe('seedNativeFixtures', () => {
    it('creates four verified native fixtures linked under the native issuer without business authority', async () => {
        const { deps, statements } = dependencies()
        const metadata = await seedNativeFixtures(deps, input)

        expect(metadata).toEqual({
            version: 1,
            checkoutRoot: ROOT,
            composeProject: 'lef',
            issuer: ISSUER,
            users: NATIVE_FIXTURES.map(({ fixture, email }, index) => ({
                fixture,
                email,
                nativeUserId: uuid(1, index),
                externalIdentityId: uuid(2, index),
            })),
        })
        const sql = statements.map(({ text }) => text).join('\n')
        expect(sql).not.toMatch(/organization_memberships|credit_|better_auth_two_factors|two_factor_enabled/)
        expect(statements.filter(({ text }) => text.includes('INSERT INTO external_identities'))).toHaveLength(4)
        expect(statements.find(({ text }) => text.includes('INSERT INTO external_identities'))?.values[0]).toBe(ISSUER)
    })

    it('reproduces the same metadata on a rerun with recorded identifiers', async () => {
        const first = await seedNativeFixtures(dependencies().deps, input)
        await expect(seedNativeFixtures(dependencies().deps, { ...input, previous: first })).resolves.toEqual(first)
    })

    it('refuses a fixture whose native identity changed since the recorded seed', async () => {
        const previous = await seedNativeFixtures(dependencies().deps, input)
        const { deps } = dependencies({
            ensureUnverifiedByEmail: email =>
                Promise.resolve({ id: uuid(9, 9), email, emailVerified: false, created: true }),
        })
        await expect(seedNativeFixtures(deps, { ...input, previous })).rejects.toThrow(
            'Native owner fixture no longer matches its recorded identity',
        )
    })

    it('refuses an ambiguous native external identity for a fixture address', async () => {
        const { deps } = dependencies({
            query: (<Row extends object>(text: string) =>
                Promise.resolve(
                    (text.includes('subject <>') ? [{ id: uuid(3, 1) }] : []) as unknown as Row[],
                )) as NativeFixtureSeedDependencies['query'],
        })
        await expect(seedNativeFixtures(deps, input)).rejects.toBeInstanceOf(NativeFixtureSeedError)
    })

    it('refuses a fixture the native runtime cannot read back as verified', async () => {
        const { deps } = dependencies({ readNativeUser: () => Promise.resolve(undefined) })
        await expect(seedNativeFixtures(deps, input)).rejects.toThrow('not readable through the native runtime')
    })
})

describe('parseNativeFixtureMetadata', () => {
    let metadata: NativeFixtureMetadata

    beforeAll(async () => {
        metadata = await seedNativeFixtures(dependencies().deps, input)
    })

    it('accepts metadata recorded by this checkout and stack', () => {
        expect(parseNativeFixtureMetadata(metadata, ROOT, 'lef', ISSUER)).toEqual(metadata)
    })

    it.each([
        ['another checkout', { checkoutRoot: '/another/checkout' }],
        ['another stack', { composeProject: 'lef-isolated' }],
        ['another issuer', { issuer: 'http://localhost:58080/realms/lead-email-finder' }],
        ['an unknown version', { version: 2 }],
    ])('refuses metadata from %s', (_name, change) => {
        expect(() => parseNativeFixtureMetadata({ ...metadata, ...change }, ROOT, 'lef', ISSUER)).toThrow(
            'belongs to another checkout or stack',
        )
    })

    it('refuses malformed or ambiguous fixture records', () => {
        const [owner] = metadata.users
        for (const users of [
            [owner, owner],
            [{ ...owner, email: 'someone@lef.test' }],
            [{ ...owner, nativeUserId: 'not-a-uuid' }],
            [{ ...owner, fixture: 'auditor' }],
        ]) {
            expect(() => parseNativeFixtureMetadata({ ...metadata, users }, ROOT, 'lef', ISSUER)).toThrow(
                'malformed or ambiguous',
            )
        }
    })
})
