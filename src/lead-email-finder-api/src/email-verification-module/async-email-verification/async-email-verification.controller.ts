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
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    GetAsyncVerificationStatusRequestParamsDto,
    GetAsyncVerificationStatusResponseDto,
    VerifyAsyncRequestBodyDto,
    VerifyAsyncResponseDto,
} from './async-email-verification.dto'
import { AsyncEmailVerificationService } from './async-email-verification-service.interface'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN } from './async-email-verification.constants'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '../../credits'

@UseGuards(PermissionsGuard)
@Controller('/verifyAsync')
export class AsyncEmailVerificationController {
    constructor(
        @Inject(ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN)
        private readonly asyncEmailVerificationService: AsyncEmailVerificationService,
    ) {}

    @Post()
    @RequirePermissions('verification:run')
    @UseGuards(CreditGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: VerifyAsyncResponseDto })
    async verifyAsync(@Body() request: VerifyAsyncRequestBodyDto): Promise<VerifyAsyncResponseDto> {
        return await this.asyncEmailVerificationService.verifyAsync(request)
    }

    @Get(':id')
    @RequirePermissions('verification:read')
    @SerializeOptions({ type: GetAsyncVerificationStatusResponseDto })
    async getAsyncVerificationState(
        @Param() { id }: GetAsyncVerificationStatusRequestParamsDto,
    ): Promise<GetAsyncVerificationStatusResponseDto> {
        try {
            return await this.asyncEmailVerificationService.getAsyncVerificationState(id)
        } catch (error) {
            if (error instanceof AsyncEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
