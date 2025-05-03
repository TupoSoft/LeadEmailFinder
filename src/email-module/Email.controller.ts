import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post } from '@nestjs/common'
import { CreateEmailRequestDto, UpdateEmailRequestDto } from './dto'
import { Email } from './Email.schema'
import { EMAIL_SERVICE_TOKEN } from './Email.constants'
import { IEmailService } from './interfaces'
import { EmailNotFoundException } from './exceptions'

@Controller('emails')
export class EmailController {
    constructor(@Inject(EMAIL_SERVICE_TOKEN) private readonly emailService: IEmailService) {}

    @Post()
    @HttpCode(201)
    async createEmail(@Body() { email, exists, format }: CreateEmailRequestDto): Promise<Email> {
        return await this.emailService.createEmail({ email, exists, format })
    }

    @Get()
    async getEmails(): Promise<Email[]> {
        return await this.emailService.getEmails()
    }

    @Get(':email')
    async getEmail(@Param('email') email: string): Promise<Email> {
        try {
            return await this.emailService.getEmail(email)
        } catch (error) {
            if (error instanceof EmailNotFoundException) {
                throw new NotFoundException(`The email ${email} was not found`)
            }

            throw error
        }
    }

    @Patch(':email')
    async updateEmail(
        @Param('email') email: string,
        @Body() { format, exists }: UpdateEmailRequestDto,
    ): Promise<Email> {
        try {
            return await this.emailService.updateEmail(email, { format, exists })
        } catch (error) {
            if (error instanceof EmailNotFoundException) {
                throw new NotFoundException(`The email ${email} was not found`)
            }

            throw error
        }
    }
}
