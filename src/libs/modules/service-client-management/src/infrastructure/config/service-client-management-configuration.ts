import { ConfigService } from '@nestjs/config'
import { ServiceClientManagementConfiguration } from '../../application/service-client-management-configuration'

export function createServiceClientManagementConfiguration(
    configService: ConfigService,
): ServiceClientManagementConfiguration {
    return { issuer: configService.getOrThrow<string>('OIDC_ISSUER_URL') }
}
