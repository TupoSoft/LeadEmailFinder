import { Controller, Get, HttpStatus, Inject, Post, Query, Req, Res, SerializeOptions } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Public } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/public.decorator'
import { CurrentPrincipal } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/current-principal.decorator'
import { BFF_SESSION_COOKIE_NAME } from '@tuposoft/lead-email-finder/modules/auth/application/credential-extractor'
import { BffSessionFlowService } from '../../application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../config/bff-session-configuration'
import { BFF_CSRF_COOKIE_NAME, BFF_LOGIN_STATE_COOKIE_NAME } from './bff-cookie-names'
import { AuthCallbackQueryDto, SessionResponseDto } from './bff-session.dto'
import { buildCsrfCookieOptions, buildLoginStateCookieOptions, buildSessionCookieOptions } from './cookie-options'
import { firstHeaderValue, parseCookieHeader } from './parse-cookie-header'

@Controller('v1/auth')
export class BffSessionController {
    constructor(
        private readonly bffSessionFlow: BffSessionFlowService,
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration,
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

        const { sessionId, csrfToken } = await this.bffSessionFlow.handleCallback({
            code: query.code,
            state: query.state,
            cookieState: cookies[BFF_LOGIN_STATE_COOKIE_NAME],
            existingSessionId: cookies[BFF_SESSION_COOKIE_NAME],
        })

        res.clearCookie(BFF_LOGIN_STATE_COOKIE_NAME, buildLoginStateCookieOptions(this.configuration))
        res.cookie(BFF_SESSION_COOKIE_NAME, sessionId, buildSessionCookieOptions(this.configuration))
        res.cookie(BFF_CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions(this.configuration))
        res.redirect(HttpStatus.FOUND, this.configuration.appBaseUrl)
    }

    @Get('session')
    @SerializeOptions({ type: SessionResponseDto })
    getSession(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
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
