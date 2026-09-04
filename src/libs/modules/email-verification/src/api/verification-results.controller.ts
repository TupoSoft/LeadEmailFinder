import {
    Controller,
    Get,
    Inject,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { VERIFICATION_RESULT_READER, VerificationResultReader } from '../application/verification-result-reader'
import { EmailVerificationResponseDto } from './email-verification-response.dto'

@Controller('verifications')
@UseGuards(PermissionsGuard)
@RequirePermissions('verification:read')
export class VerificationResultsController {
    constructor(@Inject(VERIFICATION_RESULT_READER) private readonly reader: VerificationResultReader) {}

    @Get(':id')
    @SerializeOptions({ type: EmailVerificationResponseDto })
    async findOwned(
        @Param('id', new ParseUUIDPipe()) id: string,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<EmailVerificationResponseDto> {
        const result = await this.reader.findOwned({ id, organizationId: principal.organizationId })
        if (!result) throw new NotFoundException('Verification result not found')
        return result
    }
}
