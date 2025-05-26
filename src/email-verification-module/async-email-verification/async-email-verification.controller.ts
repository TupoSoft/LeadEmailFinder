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
} from '@nestjs/common'
import {
    GetAsyncVerificationStatusDto,
    VerifyAsyncRequestDto,
    VerifyAsyncResponseDto,
} from './async-email-verification.dto'
import { AsyncEmailVerificationService } from './async-email-verification-service.interface'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN } from './async-email-verification.constants'

@Controller('/verifyAsync')
export class AsyncEmailVerificationController {
    constructor(
        @Inject(ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN)
        private readonly asyncEmailVerificationService: AsyncEmailVerificationService,
    ) {}

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: VerifyAsyncResponseDto })
    async verifyAsync(@Body() request: VerifyAsyncRequestDto): Promise<VerifyAsyncResponseDto> {
        return await this.asyncEmailVerificationService.verifyAsync(request)
    }

    @Get(':id')
    @SerializeOptions({ type: GetAsyncVerificationStatusDto })
    async getAsyncVerificationState(@Param('id') id: string): Promise<GetAsyncVerificationStatusDto> {
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
