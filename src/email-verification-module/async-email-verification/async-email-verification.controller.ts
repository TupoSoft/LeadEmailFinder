import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import { GetAsyncVerificationStatusDto, VerifyAsyncResponseDto } from './async-email-verification.dto'
import { AsyncEmailVerificationService } from './async-email-verification-service.interface'

@Controller('/emails/:email/verify-async')
export class AsyncEmailVerificationController {
    constructor(private readonly asyncEmailVerificationService: AsyncEmailVerificationService) {}

    @Post()
    async verifyAsync(@Param('email') email: string): Promise<VerifyAsyncResponseDto> {
        return await this.asyncEmailVerificationService.verifyAsync(email)
    }

    @Get(':id')
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
