import {
    Controller,
    ForbiddenException,
    Get,
    HttpStatus,
    Inject,
    Post,
    Query,
    Req,
    Res,
    SerializeOptions,
    UnauthorizedException,
} from '@nestjs/common'
import {
    ApiCookieAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Request, Response } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { BFF_SESSION_COOKIE_NAME, CurrentPrincipal, Public } from '@tuposoft/lead-email-finder/modules/auth'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from '../application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../application/bff-session-configuration'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from '../application/current-account.service'
import { SingleActiveMembershipRequiredError } from '../application/human-membership-resolver.service'
import { BFF_CSRF_COOKIE_NAME, BFF_LOGIN_STATE_COOKIE_NAME } from './bff-cookie-names'
import {
    AuthenticationRequiredResponseDto,
    AuthCallbackQueryDto,
    CurrentAccountContextDto,
    HumanSessionRequiredResponseDto,
} from './bff-session.dto'
import { buildCsrfCookieOptions, buildLoginStateCookieOptions, buildSessionCookieOptions } from './cookie-options'
import { firstHeaderValue, parseCookieHeader } from './parse-cookie-header'

@Controller('v1/auth')
export class BffSessionController {
    constructor(
        private readonly bffSessionFlow: BffSessionFlowService,
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration,
        private readonly currentAccountService: CurrentAccountService,
    ) {}

    @Public()
    @Get('login')
    async login(@Res() res: Response): Promise<void> {
        const { authorizationUrl, state } = await this.bffSessionFlow.login()

        res.cookie(BFF_LOGIN_STATE_COOKIE_NAME, state, buildLoginStateCookieOptions(this.configuration))
        res.redirect(HttpStatus.FOUND, authorizationUrl)
    }

    @Public()
    @Get('callback')
    async callback(@Query() query: AuthCallbackQueryDto, @Req() req: Request, @Res() res: Response): Promise<void> {
        const cookies = parseCookieHeader(firstHeaderValue(req.headers['cookie']))

        let sessionId: string
        let csrfToken: string
        try {
            ;({ sessionId, csrfToken } = await this.bffSessionFlow.handleCallback({
                code: query.code,
                state: query.state,
                cookieState: cookies[BFF_LOGIN_STATE_COOKIE_NAME],
                existingSessionId: cookies[BFF_SESSION_COOKIE_NAME],
            }))
        } catch (error) {
            if (error instanceof LoginStateInvalidError || error instanceof AuthorizationCodeExchangeFailedError) {
                throw new UnauthorizedException(error.message)
            }
            if (error instanceof SingleActiveMembershipRequiredError) {
                throw new ForbiddenException(error.message)
            }
            throw error
        }

        res.clearCookie(BFF_LOGIN_STATE_COOKIE_NAME, buildLoginStateCookieOptions(this.configuration))
        res.cookie(BFF_SESSION_COOKIE_NAME, sessionId, buildSessionCookieOptions(this.configuration))
        res.cookie(BFF_CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions(this.configuration))
        res.redirect(HttpStatus.FOUND, this.configuration.appBaseUrl)
    }

    @Get('session')
    @ApiCookieAuth(BFF_SESSION_COOKIE_NAME)
    @ApiOperation({
        summary: 'Read the current browser account',
        description:
            'Returns browser-safe identity, membership, organization, capability, and service-client grant data for an authenticated human session.',
    })
    @ApiOkResponse({ type: CurrentAccountContextDto, description: 'Current browser account context.' })
    @ApiUnauthorizedResponse({
        type: AuthenticationRequiredResponseDto,
        description: 'Authentication is missing, invalid, expired, or no longer maps to a usable account.',
    })
    @ApiForbiddenResponse({
        type: HumanSessionRequiredResponseDto,
        description: 'The authenticated credential is a service client rather than a human session.',
    })
    @SerializeOptions({ type: CurrentAccountContextDto })
    async getSession(@CurrentPrincipal() principal: AuthPrincipal): Promise<CurrentAccountContextDto> {
        try {
            return await this.currentAccountService.get(principal)
        } catch (error) {
            if (error instanceof HumanSessionRequiredError) {
                throw new ForbiddenException({ code: 'human_session_required' })
            }
            if (error instanceof CurrentAccountUnavailableError) {
                throw new UnauthorizedException({ code: 'authentication_required' })
            }
            throw error
        }
    }

    @Post('logout')
    async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
        const cookies = parseCookieHeader(firstHeaderValue(req.headers['cookie']))

        await this.bffSessionFlow.logout(cookies[BFF_SESSION_COOKIE_NAME])

        res.clearCookie(BFF_SESSION_COOKIE_NAME, buildSessionCookieOptions(this.configuration))
        res.clearCookie(BFF_CSRF_COOKIE_NAME, buildCsrfCookieOptions(this.configuration))
        res.status(HttpStatus.NO_CONTENT).send()
    }
}
