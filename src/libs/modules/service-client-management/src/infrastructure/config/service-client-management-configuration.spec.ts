import { ConfigService } from '@nestjs/config'
import { createServiceClientManagementConfiguration } from './service-client-management-configuration'

describe('createServiceClientManagementConfiguration', () => {
    it('reads the service credential issuer from OIDC_ISSUER_URL', () => {
        const configService = {
            getOrThrow: jest.fn().mockReturnValue('https://issuer.example.test/realms/lef'),
        } as unknown as ConfigService

        expect(createServiceClientManagementConfiguration(configService)).toEqual({
            issuer: 'https://issuer.example.test/realms/lef',
        })
        expect(configService.getOrThrow).toHaveBeenCalledWith('OIDC_ISSUER_URL')
    })
})
