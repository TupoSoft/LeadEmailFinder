import { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureServiceClientResponseHeaders } from '../../../../configure-service-client-response-headers'
import {
    ActiveServiceCredentialReader,
    AUTH_IDENTITY_ISSUER,
    AuthPrincipal,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ApiKeyController } from './api-key.controller'
import { AuthGuard } from './auth.guard'
import { ApiKeyCredentialAuthenticator } from '../application/api-key-credential-authenticator'
import { AuthenticationService } from '../application/authentication.service'
import { CredentialExtractor } from '../application/credential-extractor'

const apiKey = `lef_${'a'.repeat(43)}`
describe('GET /v1/auth/api-key', () => {
    let app: INestApplication
    let active = true
    const reader: ActiveServiceCredentialReader = {
        findByIssuerAndSubject: () => Promise.resolve(undefined),
        findByKeyHash: () =>
            Promise.resolve(
                active
                    ? {
                          id: 'credential',
                          organizationId: 'organization',
                          issuer: AUTH_IDENTITY_ISSUER,
                          subject: 'credential',
                          displayName: 'Verification only',
                          keyPrefix: apiKey.slice(0, 12),
                          status: 'active',
                          permissions: ['verification:run'],
                      }
                    : undefined,
            ),
    }
    const human: AuthPrincipal = {
        credentialKind: 'human_session',
        issuer: 'issuer',
        subject: 'human',
        credentialId: 'human',
        organizationId: 'organization',
        membershipRole: 'owner',
        permissions: [],
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ApiKeyController],
            providers: [
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [
                        new ApiKeyCredentialAuthenticator(reader, key => key),
                        {
                            supports: credential => credential.scheme === 'session-cookie',
                            authenticate: () => Promise.resolve(human),
                        },
                    ]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
            ],
        }).compile()
        app = module.createNestApplication({ logger: false })
        configureServiceClientResponseHeaders(app)
        await app.init()
    })
    afterAll(async () => app.close())
    beforeEach(() => {
        active = true
    })

    it('returns an empty no-store 204 for a verification-only key', async () => {
        const result = await request(app.getHttpServer())
            .get('/v1/auth/api-key')
            .set('Authorization', `Bearer ${apiKey}`)
            .expect(204)
        expect(result.text).toBe('')
        expect(result.headers['cache-control']).toBe('no-store')
        expect(result.headers['referrer-policy']).toBe('no-referrer')
    })
    it('rejects human sessions with 403', async () => {
        await request(app.getHttpServer()).get('/v1/auth/api-key').set('Cookie', 'lef_session=valid').expect(403)
    })
    it.each(['Bearer header.payload.signature', 'Basic invalid', 'Bearer ', 'Bearer lef_short'])(
        'rejects malformed or legacy authorization despite a valid cookie',
        async authorization => {
            await request(app.getHttpServer())
                .get('/v1/auth/api-key')
                .set('Cookie', 'lef_session=valid')
                .set('Authorization', authorization)
                .expect(401, { code: 'authentication_required' })
        },
    )
    it('rejects duplicate Authorization headers despite Node header collapsing', async () => {
        await request(app.getHttpServer())
            .get('/v1/auth/api-key')
            .set({ Authorization: [`Bearer ${apiKey}`, `Bearer ${apiKey}`] })
            .expect(401)
    })
    it('rejects the very next authentication after a key is revoked', async () => {
        await request(app.getHttpServer()).get('/v1/auth/api-key').set('Authorization', `Bearer ${apiKey}`).expect(204)
        active = false
        await request(app.getHttpServer()).get('/v1/auth/api-key').set('Authorization', `Bearer ${apiKey}`).expect(401)
    })
    it('rejects a missing credential', async () => {
        await request(app.getHttpServer()).get('/v1/auth/api-key').expect(401).expect('Cache-Control', 'no-store')
    })
})
