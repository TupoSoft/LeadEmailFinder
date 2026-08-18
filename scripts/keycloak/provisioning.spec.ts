import {
    createBffClient,
    createOrgAdminClient,
    createRealmRepresentation,
    createServiceClient,
    reconcileResource,
} from './provisioning'

describe('reconcileResource', (): void => {
    it('creates a missing resource once and updates it on repeated provisioning', async (): Promise<void> => {
        let resource: { id: string } | undefined
        const create = jest.fn((): Promise<void> => {
            resource = { id: 'created-id' }
            return Promise.resolve()
        })
        const update = jest.fn((): Promise<void> => Promise.resolve())
        const repository = {
            find: (): Promise<{ id: string } | undefined> => Promise.resolve(resource),
            create,
            update,
        }

        await reconcileResource(repository)
        await reconcileResource(repository)

        expect(create).toHaveBeenCalledTimes(1)
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('fails when a created resource cannot be read back', async (): Promise<void> => {
        await expect(
            reconcileResource({
                find: () => Promise.resolve(undefined),
                create: () => Promise.resolve(),
                update: () => Promise.resolve(),
            }),
        ).rejects.toThrow('not visible after creation')
    })
})

describe('Keycloak provisioning model', (): void => {
    it('restricts the BFF to configured redirects, Authorization Code, and PKCE S256', (): void => {
        const client = createBffClient({
            bffRedirectUris: ['http://localhost:3001/api/auth/callback'],
            bffPostLogoutRedirectUris: ['http://localhost:3001/'],
        })

        expect(client).toMatchObject({
            redirectUris: ['http://localhost:3001/api/auth/callback'],
            webOrigins: ['http://localhost:3001'],
            standardFlowEnabled: true,
            implicitFlowEnabled: false,
            directAccessGrantsEnabled: false,
            serviceAccountsEnabled: false,
            attributes: {
                'pkce.code.challenge.method': 'S256',
                'post.logout.redirect.uris': 'http://localhost:3001/',
            },
        })
    })

    it('allows only Client Credentials on the seeded service client', (): void => {
        expect(createServiceClient()).toMatchObject({
            standardFlowEnabled: false,
            implicitFlowEnabled: false,
            directAccessGrantsEnabled: false,
            serviceAccountsEnabled: true,
        })
    })

    it('allows only Client Credentials on the seeded organization administration client', (): void => {
        expect(createOrgAdminClient()).toMatchObject({
            standardFlowEnabled: false,
            implicitFlowEnabled: false,
            directAccessGrantsEnabled: false,
            serviceAccountsEnabled: true,
        })
    })

    it('enables organizations, verified email, recovery, and brute-force protection', (): void => {
        expect(createRealmRepresentation()).toMatchObject({
            organizationsEnabled: true,
            verifyEmail: true,
            resetPasswordAllowed: true,
            bruteForceProtected: true,
        })
    })
})
