import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
    Req,
    Res,
    SerializeOptions,
    ServiceUnavailableException,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common'
import {
    ApiBody,
    ApiCookieAuth,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { randomBytes } from 'node:crypto'
import { Request, Response } from 'express'
import { nativeSessionCookieEffects, nativeSessionCookieName } from '@tuposoft/lead-email-finder/better-auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    BFF_SESSION_COOKIE_NAME,
    CredentialRejectedError,
    CurrentPrincipal,
    Public,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BFF_SESSION_CONFIGURATION, BrowserSessionConfiguration } from '../application/bff-session-configuration'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from '../application/current-account.service'
import { NativeSignInStateService } from '../application/native-sign-in-state.service'
import { VERIFIED_HUMAN_SESSION_READER, VerifiedHumanSessionReader } from '../application/verified-human-session-reader'
import { BFF_CSRF_COOKIE_NAME, BFF_CSRF_HEADER_NAME } from './bff-cookie-names'
import {
    AuthenticationRequiredResponseDto,
    CurrentAccountContextDto,
    HumanSessionRequiredResponseDto,
} from './bff-session.dto'
import {
    AuthenticationUnavailableDto,
    EmptyAuthMutationDto,
    MagicLinkAcceptedDto,
    MagicLinkRequestDto,
    MagicLinkVerifiedDto,
    MagicLinkVerifyDto,
    MfaCodeDto,
    MfaEnrollmentDto,
    SignInStateDto,
} from './native-browser-auth.dto'
import { BrowserSessionMutationGuard } from './browser-session-mutation.guard'
import { buildCsrfClearCookieOptions, buildCsrfCookieOptions } from './cookie-options'
import { OriginGuard } from './origin.guard'
import { readPresentedCookie } from './parse-cookie-header'

const strictBody = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
})

@Controller('v1/auth')
@ApiResponse({
    status: 503,
    type: AuthenticationUnavailableDto,
    description: 'Authentication is temporarily unavailable.',
})
export class BffSessionController {
    constructor(
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BrowserSessionConfiguration,
        private readonly currentAccountService: CurrentAccountService,
        private readonly signInState: NativeSignInStateService,
        @Inject(VERIFIED_HUMAN_SESSION_READER) private readonly sessionReader: VerifiedHumanSessionReader,
        private readonly originGuard: OriginGuard,
        private readonly mutationGuard: BrowserSessionMutationGuard,
    ) {}

    @Public()
    @Post('magic-link/request')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ operationId: 'requestBrowserMagicLink', summary: 'Request an email sign-in link', security: [] })
    @ApiResponse({
        status: 202,
        type: MagicLinkAcceptedDto,
        description: 'Generic acceptance, regardless of account existence.',
    })
    @SerializeOptions({ type: MagicLinkAcceptedDto })
    requestMagicLink(
        @Body(strictBody) _body: MagicLinkRequestDto,
        @Req() req: Request,
    ): MagicLinkAcceptedDto {
        this.originGuard.checkOrigin(req)
        return this.mutationUnavailable()
    }

    @Public()
    @Post('magic-link/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        operationId: 'verifyBrowserMagicLink',
        summary: 'Explicitly confirm an email sign-in link',
        security: [],
    })
    @ApiOkResponse({ type: MagicLinkVerifiedDto })
    @SerializeOptions({ type: MagicLinkVerifiedDto })
    verifyMagicLink(
        @Body(strictBody) _body: MagicLinkVerifyDto,
        @Req() req: Request,
    ): MagicLinkVerifiedDto {
        this.originGuard.checkOrigin(req)
        return this.mutationUnavailable()
    }

    @Public()
    @Get('sign-in-state')
    @ApiOperation({ operationId: 'getBrowserSignInState', summary: 'Read safe browser sign-in state', security: [] })
    @ApiOkResponse({ type: SignInStateDto })
    @SerializeOptions({ type: SignInStateDto })
    async getSignInState(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignInStateDto> {
        return this.withNativeCookies(res, async () => {
            const { state } = await this.signInState.read(this.sessionCredential(req))
            if (state === 'signed_out') {
                res.clearCookie(BFF_CSRF_COOKIE_NAME, buildCsrfClearCookieOptions(this.configuration))
            } else {
                this.bootstrapCsrf(req, res)
            }
            return { state }
        })
    }

    @Public()
    @Post('mfa/enroll')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        operationId: 'enrollBrowserMfa',
        summary: 'Enroll a passwordless authenticator',
        security: [{ lef_session: [], 'x-csrf-token': [] }],
    })
    @ApiBody({ type: EmptyAuthMutationDto, required: false })
    @ApiOkResponse({ type: MfaEnrollmentDto })
    @SerializeOptions({ type: MfaEnrollmentDto })
    async enrollMfa(
        @Body(strictBody) _body: EmptyAuthMutationDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<MfaEnrollmentDto> {
        return this.rejectNativeMutation(req, res)
    }

    @Public()
    @Post('mfa/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        operationId: 'verifyBrowserMfa',
        summary: 'Verify an authenticator code',
        security: [{ lef_session: [], 'x-csrf-token': [] }],
    })
    @ApiOkResponse({ type: SignInStateDto })
    @SerializeOptions({ type: SignInStateDto })
    async verifyMfa(
        @Body(strictBody) _body: MfaCodeDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<SignInStateDto> {
        return this.rejectNativeMutation(req, res)
    }

    @Public()
    @Post('mfa/recover')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        operationId: 'recoverBrowserMfa',
        summary: 'Use one recovery code',
        security: [{ lef_session: [], 'x-csrf-token': [] }],
    })
    @ApiOkResponse({ type: SignInStateDto })
    @SerializeOptions({ type: SignInStateDto })
    async recoverMfa(
        @Body(strictBody) _body: MfaCodeDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<SignInStateDto> {
        return this.rejectNativeMutation(req, res)
    }

    @Get('session')
    @ApiCookieAuth(BFF_SESSION_COOKIE_NAME)
    @ApiOperation({ operationId: 'getCurrentAccount', summary: 'Read the current browser account' })
    @ApiOkResponse({ type: CurrentAccountContextDto })
    @ApiUnauthorizedResponse({ type: AuthenticationRequiredResponseDto })
    @ApiForbiddenResponse({ type: HumanSessionRequiredResponseDto })
    @SerializeOptions({ type: CurrentAccountContextDto })
    async getSession(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<CurrentAccountContextDto> {
        try {
            const account = await this.currentAccountService.get(principal)
            this.bootstrapCsrf(req, res)
            return account
        } catch (error) {
            if (error instanceof HumanSessionRequiredError)
                throw new ForbiddenException({ code: 'human_session_required' })
            if (error instanceof CurrentAccountUnavailableError)
                throw new UnauthorizedException({ code: 'authentication_required' })
            throw new ServiceUnavailableException({ code: 'authentication_unavailable' })
        }
    }

    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        operationId: 'logoutBrowserSession',
        summary: 'End the browser session',
        security: [{ [BFF_SESSION_COOKIE_NAME]: [], [BFF_CSRF_HEADER_NAME]: [] }],
    })
    @ApiHeader({ name: 'Origin', required: false, description: 'Exact application origin.' })
    @ApiHeader({ name: 'Referer', required: false, description: 'Same-origin fallback when Origin is absent.' })
    @ApiBody({ type: EmptyAuthMutationDto, required: false })
    @ApiNoContentResponse({ description: 'Only returned after authoritative session revocation.' })
    @ApiUnauthorizedResponse({ type: AuthenticationRequiredResponseDto })
    @ApiForbiddenResponse({ description: 'Origin or CSRF check failed.' })
    async logout(
        @Body(strictBody) _body: EmptyAuthMutationDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        return this.rejectNativeMutation(req, res)
    }

    private bootstrapCsrf(req: Request, res: Response): void {
        const cookieHeader = req.headers.cookie
        if (typeof cookieHeader === 'string' && readPresentedCookie(cookieHeader, BFF_CSRF_COOKIE_NAME)) return
        res.cookie(
            BFF_CSRF_COOKIE_NAME,
            randomBytes(32).toString('base64url'),
            buildCsrfCookieOptions(this.configuration),
        )
    }

    private sessionCredential(req: Request): string | undefined {
        const cookieHeader = req.headers.cookie
        if (cookieHeader !== undefined && typeof cookieHeader !== 'string') return ''
        return readPresentedCookie(cookieHeader, nativeSessionCookieName(this.configuration.appBaseUrl))
    }

    private async rejectNativeMutation(req: Request, res: Response): Promise<never> {
        this.originGuard.checkOrigin(req)
        return this.withNativeCookies(res, async () => {
            const credential = this.sessionCredential(req)
            const session = credential ? await this.sessionReader.read(credential) : undefined
            if (!session) throw new UnauthorizedException({ code: 'authentication_required' })
            this.mutationGuard.checkSessionMutation(req)
            return this.mutationUnavailable()
        })
    }

    private async withNativeCookies<T>(res: Response, operation: () => Promise<T>): Promise<T> {
        try {
            return await nativeSessionCookieEffects.run(operation, cookies => {
                for (const cookie of cookies) res.append('Set-Cookie', cookie)
            })
        } catch (error) {
            if (error instanceof CredentialRejectedError)
                throw new UnauthorizedException({ code: 'authentication_required' })
            if (
                error instanceof UnauthorizedException ||
                error instanceof ForbiddenException ||
                error instanceof ServiceUnavailableException
            )
                throw error
            throw new ServiceUnavailableException({ code: 'authentication_unavailable' })
        }
    }

    private mutationUnavailable(): never {
        // The next plan item installs token consumption, attempt limits, MFA writes, and authoritative revocation.
        throw new ServiceUnavailableException({ code: 'authentication_unavailable' })
    }
}
