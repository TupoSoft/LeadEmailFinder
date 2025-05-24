import {
    Body,
    ConflictException,
    Controller,
    Get,
    HttpCode,
    Inject,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import { EMAIL_SERVICE_TOKEN } from './email.constants'
import { IEmailService } from '../../common'
import { CreateEmailRequestDto } from './create-email-request.dto'
import { EmailResponseDto } from './email-response.dto'
import { EmailAlreadyExistsException } from './email-already-exists.exception'
import { EmailNotFoundException } from './email-not-found.exception'
import { UpdateEmailRequestDto } from './update-email-request.dto'

@Controller('emails')
export class EmailController {
    constructor(@Inject(EMAIL_SERVICE_TOKEN) private readonly emailService: IEmailService) {}

    @Post()
    @HttpCode(201)
    async createEmail(@Body() { email, exists, format }: CreateEmailRequestDto): Promise<EmailResponseDto> {
        try {
            return await this.emailService.createEmail({ email, exists, format })
        } catch (error) {
            if (error instanceof EmailAlreadyExistsException) {
                throw new ConflictException(error.message)
            }

            throw error
        }
    }

    @Get()
    async getEmails(): Promise<EmailResponseDto[]> {
        return await this.emailService.getEmails()
    }

    @Get(':email')
    async getEmail(@Param('email') email: string): Promise<EmailResponseDto> {
        try {
            return await this.emailService.getEmail(email)
        } catch (error) {
            if (error instanceof EmailNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }

    @Patch(':email')
    async updateEmail(
        @Param('email') email: string,
        @Body() { format, exists }: UpdateEmailRequestDto,
    ): Promise<EmailResponseDto> {
        try {
            return await this.emailService.updateEmail(email, { format, exists })
        } catch (error) {
            if (error instanceof EmailNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
