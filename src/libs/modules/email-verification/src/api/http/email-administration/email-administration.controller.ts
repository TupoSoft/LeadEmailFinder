import {
    Body,
    ConflictException,
    Controller,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common'
import { CreateEmailRequestDto } from './create-email-request.dto'
import { EmailResponseDto, toEmailResponseDto } from './email-response.dto'
import { UpdateEmailRequestDto } from './update-email-request.dto'
import { ApiExcludeController } from '@nestjs/swagger'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { EmailAdministrationService } from '../../../application/email-administration.service'
import { EmailAlreadyExistsError, EmailNotFoundError } from '../../../domain/errors'

@UseGuards(PermissionsGuard)
@RequirePermissions('platform:admin')
@ApiExcludeController()
@Controller('emails')
export class EmailAdministrationController {
    constructor(private readonly emailAdministration: EmailAdministrationService) {}

    @Post()
    @HttpCode(201)
    async createEmail(
        @Body() { email, exists, format }: CreateEmailRequestDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<EmailResponseDto> {
        try {
            const record = await this.emailAdministration.createEmail(principal.organizationId, {
                email,
                exists,
                format,
            })
            return toEmailResponseDto(record)
        } catch (error) {
            if (error instanceof EmailAlreadyExistsError) {
                throw new ConflictException(error.message)
            }

            throw error
        }
    }

    @Get()
    async getEmails(@CurrentPrincipal() principal: AuthPrincipal): Promise<EmailResponseDto[]> {
        const records = await this.emailAdministration.getEmails(principal.organizationId)
        return records.map(toEmailResponseDto)
    }

    @Get(':email')
    async getEmail(
        @Param('email') email: string,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<EmailResponseDto> {
        try {
            const record = await this.emailAdministration.getEmail(principal.organizationId, email)
            return toEmailResponseDto(record)
        } catch (error) {
            if (error instanceof EmailNotFoundError) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }

    @Patch(':email')
    async updateEmail(
        @Param('email') email: string,
        @Body() { format, exists }: UpdateEmailRequestDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<EmailResponseDto> {
        try {
            const record = await this.emailAdministration.updateEmail(principal.organizationId, email, {
                format,
                exists,
            })
            return toEmailResponseDto(record)
        } catch (error) {
            if (error instanceof EmailNotFoundError) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
