import { Controller, ForbiddenException, Get, Header, HttpCode } from '@nestjs/common'
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiNoContentResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal } from './current-principal.decorator'

@ApiTags('Authentication')
@ApiBearerAuth('oidc')
@Controller('v1/auth')
export class ApiKeyController {
    @Get('api-key')
    @HttpCode(204)
    @Header('Cache-Control', 'no-store')
    @ApiNoContentResponse({
        description: 'The API key is active.',
        headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } },
    })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
    @ApiForbiddenResponse({ description: 'A machine API key is required.' })
    validate(@CurrentPrincipal() principal: AuthPrincipal): void {
        if (principal.credentialKind !== 'service_client') {
            throw new ForbiddenException({ code: 'api_key_required' })
        }
    }
}
