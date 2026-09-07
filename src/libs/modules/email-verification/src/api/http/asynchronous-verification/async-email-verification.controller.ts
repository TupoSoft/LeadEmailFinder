import type { Request } from 'express'
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    NotFoundException,
    Param,
    Post,
    Req,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    GetAsyncVerificationStatusRequestParamsDto,
    GetAsyncVerificationStatusResponseDto,
    VerifyAsyncRequestBodyDto,
    VerifyAsyncResponseDto,
} from './async-email-verification.dto'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
} from '../../../application/delivery/async/async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from '../../../application/delivery/async/job-not-found.exception'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'

@UseGuards(PermissionsGuard)
@Controller('/verifyAsync')
export class AsyncEmailVerificationController {
    constructor(
        @Inject(ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN)
        private readonly asyncEmailVerificationService: Pick<
            AsyncEmailVerificationService,
            'verifyAsync' | 'getAsyncVerificationState'
        >,
    ) {}

    @Post()
    @RequirePermissions('verification:run')
    @UseGuards(CreditGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: VerifyAsyncResponseDto })
    async verifyAsync(
        @Body() body: VerifyAsyncRequestBodyDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request: Request,
    ): Promise<VerifyAsyncResponseDto> {
        return await this.asyncEmailVerificationService.verifyAsync({
            email: body.email,
            organizationId: principal.organizationId,
            credentialId: principal.credentialId,
            requestId: typeof request.id === 'string' ? request.id : undefined,
        })
    }

    @Get(':id')
    @RequirePermissions('verification:read')
    @SerializeOptions({ type: GetAsyncVerificationStatusResponseDto })
    async getAsyncVerificationState(
        @Param() { id }: GetAsyncVerificationStatusRequestParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<GetAsyncVerificationStatusResponseDto> {
        try {
            return await this.asyncEmailVerificationService.getAsyncVerificationState(id, principal.organizationId)
        } catch (error) {
            if (error instanceof AsyncEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
