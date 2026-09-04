import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from '../application/bff-session-flow.service'
import { BffSessionConfiguration } from '../application/bff-session-configuration'
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

describe('BffSessionController.callback error translation', () => {
    let bffSessionFlow: jest.Mocked<Pick<BffSessionFlowService, 'handleCallback'>>
    let controller: BffSessionController

    beforeEach(() => {
        bffSessionFlow = { handleCallback: jest.fn() }
        controller = new BffSessionController(bffSessionFlow as unknown as BffSessionFlowService, configuration)
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
})
