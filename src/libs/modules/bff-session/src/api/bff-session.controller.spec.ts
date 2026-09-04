import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from '../application/bff-session-flow.service'
import { BffSessionConfiguration } from '../application/bff-session-configuration'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from '../application/current-account.service'
import { SingleActiveMembershipRequiredError } from '../application/human-membership-resolver.service'
import { AuthCallbackQueryDto } from './bff-session.dto'
import { BffSessionController } from './bff-session.controller'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer',
    backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
    jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
    clientId: 'lef-web-bff',
    clientSecret: 'secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

function requestWithNoCookies(): Request {
    return { headers: {} } as unknown as Request
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise
    } catch (error) {
        return error
    }
    throw new Error('Expected promise to reject')
}

const humanPrincipal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer.example.test',
    subject: 'human-subject',
    organizationId: 'org-1',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'external-identity-1',
}

describe('BffSessionController', () => {
    let bffSessionFlow: jest.Mocked<Pick<BffSessionFlowService, 'handleCallback'>>
    let currentAccountService: jest.Mocked<Pick<CurrentAccountService, 'get'>>
    let controller: BffSessionController

    beforeEach(() => {
        bffSessionFlow = { handleCallback: jest.fn() }
        currentAccountService = { get: jest.fn() }
        controller = new BffSessionController(
            bffSessionFlow as unknown as BffSessionFlowService,
            configuration,
            currentAccountService as unknown as CurrentAccountService,
        )
    })

    const query: AuthCallbackQueryDto = Object.assign(new AuthCallbackQueryDto(), { code: 'code', state: 'state' })

    it('translates LoginStateInvalidError into 401', async () => {
        bffSessionFlow.handleCallback.mockRejectedValue(new LoginStateInvalidError('bad state'))

        await expect(controller.callback(query, requestWithNoCookies(), {} as Response)).rejects.toThrow(
            UnauthorizedException,
        )
    })

    it('translates AuthorizationCodeExchangeFailedError into 401', async () => {
        bffSessionFlow.handleCallback.mockRejectedValue(new AuthorizationCodeExchangeFailedError())

        await expect(controller.callback(query, requestWithNoCookies(), {} as Response)).rejects.toThrow(
            UnauthorizedException,
        )
    })

    it('translates SingleActiveMembershipRequiredError into 403', async () => {
        bffSessionFlow.handleCallback.mockRejectedValue(new SingleActiveMembershipRequiredError())

        await expect(controller.callback(query, requestWithNoCookies(), {} as Response)).rejects.toThrow(
            ForbiddenException,
        )
    })

    it('propagates an unrecognized error unchanged', async () => {
        const unexpected = new Error('redis is down')
        bffSessionFlow.handleCallback.mockRejectedValue(unexpected)

        await expect(controller.callback(query, requestWithNoCookies(), {} as Response)).rejects.toBe(unexpected)
    })

    it('returns the exact nullable current-account shape from the application service', async () => {
        const account = {
            email: null,
            membership: { id: 'membership-1', role: 'owner' as const },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: [
                'verification.run' as const,
                'verification.read' as const,
                'team.manage' as const,
                'service_clients.manage' as const,
                'billing.read' as const,
                'billing.manage' as const,
            ],
            grantableServiceClientPermissions: [
                'verification:run' as const,
                'verification:read' as const,
                'members:manage' as const,
                'credentials:manage' as const,
                'billing:read' as const,
                'billing:manage' as const,
            ],
        }
        currentAccountService.get.mockResolvedValue(account)

        await expect(controller.getSession(humanPrincipal)).resolves.toEqual(account)
        expect(currentAccountService.get).toHaveBeenCalledWith(humanPrincipal)
    })

    it('maps a service-client principal to the exact human-session-required response', async () => {
        currentAccountService.get.mockRejectedValue(new HumanSessionRequiredError())

        const error = (await captureRejection(
            controller.getSession({ ...humanPrincipal, credentialKind: 'service_client' }),
        )) as ForbiddenException

        expect(error).toBeInstanceOf(ForbiddenException)
        expect(error.getStatus()).toBe(403)
        expect(error.getResponse()).toEqual({ code: 'human_session_required' })
    })

    it('maps unavailable account state to the exact authentication-required response', async () => {
        currentAccountService.get.mockRejectedValue(new CurrentAccountUnavailableError())

        const error = (await captureRejection(controller.getSession(humanPrincipal))) as UnauthorizedException

        expect(error).toBeInstanceOf(UnauthorizedException)
        expect(error.getStatus()).toBe(401)
        expect(error.getResponse()).toEqual({ code: 'authentication_required' })
    })

    it('preserves unexpected current-account failures', async () => {
        const unexpected = new Error('database unavailable')
        currentAccountService.get.mockRejectedValue(unexpected)

        await expect(controller.getSession(humanPrincipal)).rejects.toBe(unexpected)
    })
})
