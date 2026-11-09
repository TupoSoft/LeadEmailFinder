import { Inject, Injectable, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { KEYCLOAK_ADMIN_HTTP, KeycloakAdminHttp } from './keycloak-admin-http'
import { KeycloakAdminHttpModule } from './keycloak-admin-http.module'

@Injectable()
class ConsumerAProbe {
    constructor(@Inject(KEYCLOAK_ADMIN_HTTP) readonly http: KeycloakAdminHttp) {}
}

@Injectable()
class ConsumerBProbe {
    constructor(@Inject(KEYCLOAK_ADMIN_HTTP) readonly http: KeycloakAdminHttp) {}
}

@Module({ imports: [KeycloakAdminHttpModule], providers: [ConsumerAProbe] })
class ConsumerAModule {}

@Module({ imports: [KeycloakAdminHttpModule], providers: [ConsumerBProbe] })
class ConsumerBModule {}

describe('KeycloakAdminHttpModule wiring', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        process.env.OIDC_ISSUER_URL = 'http://localhost:58080/realms/lead-email-finder'
        process.env.KEYCLOAK_ORG_ADMIN_CLIENT_ID = 'lef-org-admin-service'
        process.env.KEYCLOAK_ORG_ADMIN_CLIENT_SECRET = 'secret'
        delete process.env.KEYCLOAK_ADMIN_API_BASE_URL

        fetchMock = jest.fn()
        global.fetch = fetchMock as never
    })

    afterEach(() => {
        delete process.env.OIDC_ISSUER_URL
        delete process.env.KEYCLOAK_ORG_ADMIN_CLIENT_ID
        delete process.env.KEYCLOAK_ORG_ADMIN_CLIENT_SECRET
    })

    it('resolves the same transport instance for every importing consumer module and reuses one service-account token', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true }), ConsumerAModule, ConsumerBModule],
        }).compile()

        const probeA = moduleRef.select(ConsumerAModule).get(ConsumerAProbe)
        const probeB = moduleRef.select(ConsumerBModule).get(ConsumerBProbe)

        expect(probeA.http).toBe(probeB.http)

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ access_token: 'shared-token', expires_in: 60 }),
        })
        fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, text: () => Promise.resolve('') })
        fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, text: () => Promise.resolve('') })

        await probeA.http.requestRealm('GET', '/users/1', undefined, [204])
        await probeB.http.requestRealm('GET', '/users/1', undefined, [204])

        const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
            (call[0] as string).includes('/protocol/openid-connect/token'),
        )
        expect(tokenCalls).toHaveLength(1)
    })
})
