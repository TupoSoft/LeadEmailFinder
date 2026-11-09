import { INestApplication, UnauthorizedException } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import {
    AuthenticationService,
    AuthGuard,
    PermissionsGuard,
    RolePermissionPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { configureApiSerialization } from '../../../../../configure-api-serialization'
import { configureProxyResponseHeaders } from '../../../../../configure-proxy-response-headers'
import { ProxyRepository } from '../application/ports/proxy-repository'
import { ProxyService } from '../application/proxy.service'
import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyRecord } from '../domain/proxy-record'
import { ProxyController } from './proxy.controller'
import { ProxyDto, ProxyListDto } from './proxy.dto'

const proxyId = 'ec6305c4-4f02-456a-907e-88195db4c915'
const nextId = 'fc6305c4-4f02-456a-907e-88195db4c915'
const base = '/v1/proxies'
const member = `${base}/${proxyId}`
const validCreate = { protocol: ProxyProtocol.SOCKS5, host: 'proxy.example.test', port: 1080 }
const syntheticAuth = { user: 'proxy-http-synthetic-user', pass: 'proxy-http-synthetic-password' }

function principal(role: AuthPrincipal['membershipRole'] = 'platform_admin'): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer.example.test',
        subject: 'platform-operator',
        organizationId: '5b92ded1-7eba-4c66-b72e-a5fea465da68',
        membershipRole: role,
        permissions: [],
        credentialId: 'human-identity',
    }
}

function record(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
    return {
        ...validCreate,
        id: proxyId,
        auth: syntheticAuth,
        state: ProxyLifecycle.DISABLED,
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        blacklists: ['mx.example.test'],
        createdAt: new Date('2026-08-31T12:00:00.000Z'),
        updatedAt: new Date('2026-08-31T12:00:00.000Z'),
        ...overrides,
    }
}

function expectRedacted(body: unknown): void {
    if (Array.isArray(body)) {
        body.forEach(expectRedacted)
    } else if (body !== null && typeof body === 'object') {
        for (const [key, value] of Object.entries(body)) {
            expect(['auth', 'user', 'pass'].includes(key)).toBe(false)
            expectRedacted(value)
        }
    }
    // Compare booleans so a failed assertion cannot dump entered credentials.
    const text = JSON.stringify(body)
    expect(text.includes(syntheticAuth.user) || text.includes(syntheticAuth.pass)).toBe(false)
}

describe('proxy HTTP browser contract', () => {
    let app: INestApplication
    const authenticate = jest.fn()
    const repository: jest.Mocked<ProxyRepository> = {
        create: jest.fn(),
        findById: jest.fn(),
        list: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        addBlacklist: jest.fn(),
        findActiveNotBlacklistedFor: jest.fn(),
        findAllActive: jest.fn(),
        findActiveExcluding: jest.fn(),
    }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProxyController],
            providers: [
                Reflector,
                RolePermissionPolicy,
                PermissionsGuard,
                { provide: AuthenticationService, useValue: { authenticate } },
                { provide: APP_GUARD, useClass: AuthGuard },
                { provide: ProxyService, useValue: new ProxyService(repository) },
            ],
        }).compile()
        app = module.createNestApplication({ logger: false })
        configureProxyResponseHeaders(app)
        configureApiSerialization(app)
        await app.init()
    })

    beforeEach(() => {
        jest.resetAllMocks()
        authenticate.mockResolvedValue(principal())
        repository.create.mockImplementation(fields => Promise.resolve(record({ ...fields, blacklists: [] })))
        repository.findById.mockResolvedValue(record())
        repository.list.mockResolvedValue([record()])
        repository.update.mockImplementation((_id, fields) => Promise.resolve(record(fields)))
        repository.delete.mockResolvedValue(record())
        repository.addBlacklist.mockResolvedValue(record())
        repository.findActiveNotBlacklistedFor.mockResolvedValue([record()])
    })

    afterAll(async () => {
        await app.close()
    })

    it('creates disabled by default and redacts complete authentication', async () => {
        const response = await request(app.getHttpServer())
            .post(base)
            .send({ ...validCreate, auth: syntheticAuth })
            .expect('Cache-Control', 'no-store')
            .expect(201)

        expectRedacted(response.body)
        expect(response.body).toMatchObject({ id: proxyId, state: 'disabled', blacklists: [] })
        expect(repository.create.mock.calls[0][0].auth === undefined).toBe(false)
    })

    it.each(['get', 'patch', 'delete', 'healthy', 'list'] as const)(
        'redacts authentication and exposes stored blacklists on %s responses',
        async operation => {
            const client = request(app.getHttpServer())
            const response = await (
                operation === 'patch'
                    ? client.patch(member).send({ weight: 2 })
                    : operation === 'delete'
                      ? client.delete(member)
                      : operation === 'healthy'
                        ? client.get(`${base}/healthy?mxHost=mx.other.test`)
                        : client.get(operation === 'list' ? base : member)
            ).expect(200)

            expectRedacted(response.body)
            const body = response.body as ProxyDto | ProxyListDto
            const proxy = 'proxies' in body ? body.proxies[0] : body
            expect(proxy.blacklists).toEqual(['mx.example.test'])
            if (operation === 'patch') {
                expect(response.headers['cache-control']).toBe('no-store')
                expect(Object.hasOwn(repository.update.mock.calls[0][1], 'auth')).toBe(false)
            }
        },
    )

    it('replaces authentication only with a complete pair and returns a redacted response', async () => {
        const response = await request(app.getHttpServer())
            .patch(member)
            .send({ auth: syntheticAuth })
            .expect('Cache-Control', 'no-store')
            .expect(200)
        expectRedacted(response.body)
        expect(repository.update.mock.calls[0][1].auth === undefined).toBe(false)
    })

    it('carries the cursor unchanged and uses an empty string to end a traversal', async () => {
        repository.list.mockResolvedValueOnce([record(), record({ id: nextId })]).mockResolvedValueOnce([])
        const first = await request(app.getHttpServer()).get(base).query({ pageSize: 1 }).expect(200)
        const firstPage = first.body as ProxyListDto
        expect(firstPage.nextPageToken).toBe(proxyId)
        expect(firstPage.proxies).toHaveLength(1)
        expect(Object.keys(firstPage).sort()).toEqual(['nextPageToken', 'proxies'])
        const last = await request(app.getHttpServer())
            .get(base)
            .query({ pageSize: 1, pageToken: firstPage.nextPageToken })
            .expect(200)
        expect(last.body).toEqual({ proxies: [], nextPageToken: '' })
        expect(repository.list).toHaveBeenLastCalledWith(2, proxyId)
    })

    it.each([{ pageToken: 'invalid' }, { pageToken: '' }, { pageSize: 0 }, { pageSize: 101 }])(
        'rejects an invalid cursor or page size before persistence',
        async query => {
            await request(app.getHttpServer()).get(base).query(query).expect(400)
            expect(repository.list).not.toHaveBeenCalled()
        },
    )

    it('reports an MX host with no response body and returns stored blacklist state on refresh', async () => {
        const response = await request(app.getHttpServer())
            .post(`${member}/blacklists`)
            .send({ mxHost: 'mx.example.test' })
            .expect(204)
        expect(response.text).toBe('')
        expect(repository.addBlacklist).toHaveBeenCalledWith(proxyId, 'mx.example.test')
        const refreshed = await request(app.getHttpServer()).get(member).expect(200)
        expect((refreshed.body as ProxyDto).blacklists).toEqual(['mx.example.test'])
    })

    it.each([
        ['post', base],
        ['get', base],
        ['get', member],
        ['patch', member],
        ['delete', member],
        ['post', `${member}/blacklists`],
        ['get', `${base}/healthy`],
    ] as const)('denies customer-role %s %s requests before accessing registry data', async (method, path) => {
        authenticate.mockResolvedValue(principal('owner'))
        const response = await request(app.getHttpServer())[method](path).send(validCreate).expect(403)
        expectRedacted(response.body)
        for (const adapter of Object.values(repository)) expect(adapter).not.toHaveBeenCalled()
        if ((method === 'post' && path === base) || method === 'patch') {
            expect(response.headers['cache-control']).toBe('no-store')
        }
    })

    describe.each(['post', 'patch'] as const)('%s secret-operation failures', method => {
        const path = method === 'post' ? base : member
        const createRequest = (): request.Test => request(app.getHttpServer())[method](path)

        it('prevents caching even when malformed JSON fails before guards', async () => {
            await createRequest()
                .type('json')
                .send('{')
                .expect('Cache-Control', 'no-store')
                .expect(400)
            expect(authenticate).not.toHaveBeenCalled()
        })

        it('prevents caching an authentication failure', async () => {
            authenticate.mockRejectedValue(new UnauthorizedException())
            await createRequest()
                .send(validCreate)
                .expect('Cache-Control', 'no-store')
                .expect(401)
        })

        it.each([{ user: 'synthetic-only' }, { pass: 'synthetic-only' }, { user: '', pass: '' }, null, [], [{}]])(
            'rejects incomplete authentication without echoing request values',
            async auth => {
                const response = await createRequest()
                    .send({ ...validCreate, auth })
                    .expect('Cache-Control', 'no-store')
                    .expect(400)
                expect(JSON.stringify(response.body).includes('synthetic-only')).toBe(false)
                expect(repository.create).not.toHaveBeenCalled()
                expect(repository.update).not.toHaveBeenCalled()
            },
        )

        it('prevents caching an unexpected persistence failure', async () => {
            repository.create.mockRejectedValue(new Error('Unavailable'))
            repository.update.mockRejectedValue(new Error('Unavailable'))
            const response = await createRequest()
                .send(validCreate)
                .expect('Cache-Control', 'no-store')
                .expect(500)
            expectRedacted(response.body)
        })
    })

    it('prevents caching empty-update and missing-proxy failures', async () => {
        await request(app.getHttpServer()).patch(member).send({}).expect('Cache-Control', 'no-store').expect(400)
        repository.update.mockResolvedValue(undefined)
        await request(app.getHttpServer())
            .patch(member)
            .send({ weight: 2 })
            .expect('Cache-Control', 'no-store')
            .expect(404)
    })
})
