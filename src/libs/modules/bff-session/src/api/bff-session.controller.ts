import {
    BadGatewayException,
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
    ApiQuery,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
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
import { IdTokenVerificationFailedError } from '../application/id-token-verifier'
import { BFF_CSRF_COOKIE_NAME, BFF_LOGIN_STATE_COOKIE_NAME } from './bff-cookie-names'
import {
    AuthenticationRequiredResponseDto,
    CurrentAccountContextDto,
    HumanSessionRequiredResponseDto,
} from './bff-session.dto'
import {
    buildCsrfCookieOptions,
    buildLoginStateClearCookieOptions,
    buildLoginStateCookieOptions,
    buildSessionCookieOptions,
} from './cookie-options'
import { firstHeaderValue, parseCookieHeader } from './parse-cookie-header'

const CALLBACK_ERROR_CODES = {
    invalidLoginState: 'login_state_invalid',
    authorizationCodeExchangeFailed: 'authorization_code_exchange_failed',
    activeMembershipRequired: 'active_membership_required',
} as const

type CallbackErrorCode = (typeof CALLBACK_ERROR_CODES)[keyof typeof CALLBACK_ERROR_CODES]

const CALLBACK_RESPONSE_HEADERS = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
} as const

interface CallbackSwaggerHeader {
    readonly description: string
    readonly schema: {
        readonly type: 'string'
        readonly enum?: string[]
    }
}

const CALLBACK_SWAGGER_RESPONSE_HEADERS: Record<string, CallbackSwaggerHeader> = {
    'Cache-Control': {
        description: 'Prevents storage of the authorization response.',
        schema: { type: 'string', enum: ['no-store'] },
    },
    'Referrer-Policy': {
        description: 'Prevents callback parameters from being sent as referrer data.',
        schema: { type: 'string', enum: ['no-referrer'] },
    },
    'Set-Cookie': {
        description:
            'Expires the transient login-state cookie. A successful callback also sets the session and CSRF cookies.',
        schema: { type: 'string' },
    },
}

interface ParsedAuthCallbackQuery {
    readonly code: string | undefined
    readonly state: string | undefined
}

function singleNonblankQueryValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function parseAuthCallbackQuery(query: Readonly<Record<string, unknown>>): ParsedAuthCallbackQuery {
    return {
        code: singleNonblankQueryValue(query['code']),
        state: singleNonblankQueryValue(query['state']),
    }
}

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
    @ApiOperation({
        summary: 'Complete browser authorization',
        description:
            'Consumes one pending Authorization Code with PKCE response. Success returns to the application; recoverable failures return to the same-origin error route with a stable safe code.',
    })
    @ApiQuery({
        name: 'code',
        required: false,
        type: String,
        description: 'Provider authorization code. Missing, blank, or repeated values follow the safe redirect policy.',
    })
    @ApiQuery({
        name: 'state',
        required: false,
        type: String,
        description: 'One-time login state. Missing, blank, repeated, expired, or mismatched values fail safely.',
    })
    @ApiResponse({
        status: HttpStatus.FOUND,
        description:
            'Redirects to the application after success, or to /auth/error with code login_state_invalid, authorization_code_exchange_failed, or active_membership_required.',
        headers: {
            ...CALLBACK_SWAGGER_RESPONSE_HEADERS,
            Location: {
                description: 'Same-origin application or stable callback-error URL.',
                schema: { type: 'string', format: 'uri' },
            },
        },
    })
    @ApiResponse({
        status: HttpStatus.BAD_GATEWAY,
        description:
            'The provider ID token failed integrity or claim validation. The response contains no provider detail.',
        headers: CALLBACK_SWAGGER_RESPONSE_HEADERS,
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'An unexpected provider, infrastructure, or application failure occurred without exposing detail.',
        headers: CALLBACK_SWAGGER_RESPONSE_HEADERS,
    })
    async callback(
        @Query() rawQuery: Record<string, unknown>,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        res.set(CALLBACK_RESPONSE_HEADERS)
        res.clearCookie(BFF_LOGIN_STATE_COOKIE_NAME, buildLoginStateClearCookieOptions(this.configuration))

        const query = parseAuthCallbackQuery(rawQuery)
        if (!query.state) {
            this.redirectCallbackError(res, CALLBACK_ERROR_CODES.invalidLoginState)
            return
        }

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
            if (error instanceof LoginStateInvalidError) {
                this.redirectCallbackError(res, CALLBACK_ERROR_CODES.invalidLoginState)
                return
            }
            if (error instanceof AuthorizationCodeExchangeFailedError) {
                this.redirectCallbackError(res, CALLBACK_ERROR_CODES.authorizationCodeExchangeFailed)
                return
            }
            if (error instanceof SingleActiveMembershipRequiredError) {
                this.redirectCallbackError(res, CALLBACK_ERROR_CODES.activeMembershipRequired)
                return
            }
            if (error instanceof IdTokenVerificationFailedError) {
                throw new BadGatewayException()
            }
            throw error
        }

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

    private redirectCallbackError(res: Response, code: CallbackErrorCode): void {
        const location = new URL('/auth/error', this.configuration.appBaseUrl)
        location.searchParams.set('code', code)
        res.redirect(HttpStatus.FOUND, location.toString())
    }
}
