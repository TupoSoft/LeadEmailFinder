import { Module } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
    ACTIVE_SERVICE_CREDENTIAL_READER,
    ActiveServiceCredentialReader,
    IdentityModule,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialExtractor } from './application/credential-extractor'
import { DefaultServiceClientGrantPolicy } from './application/default-service-client-grant-policy.service'
import { ApiKeyCredentialAuthenticator } from './application/api-key-credential-authenticator'
import { ApiKeyController } from './api/api-key.controller'
import { RolePermissionPolicy } from './application/role-permission-policy.service'
import { SERVICE_CLIENT_GRANT_POLICY } from './application/service-client-grant-policy'

@Module({
    imports: [IdentityModule],
    controllers: [ApiKeyController],
    providers: [
        { provide: CredentialExtractor, useFactory: () => new CredentialExtractor() },
        RolePermissionPolicy,
        {
            provide: SERVICE_CLIENT_GRANT_POLICY,
            useFactory: (rolePermissionPolicy: RolePermissionPolicy) =>
                new DefaultServiceClientGrantPolicy(rolePermissionPolicy),
            inject: [RolePermissionPolicy],
        },
        {
            provide: ApiKeyCredentialAuthenticator,
            useFactory: (reader: ActiveServiceCredentialReader) =>
                new ApiKeyCredentialAuthenticator(reader, key => createHash('sha256').update(key).digest('hex')),
            inject: [ACTIVE_SERVICE_CREDENTIAL_READER],
        },
    ],
    exports: [CredentialExtractor, ApiKeyCredentialAuthenticator, SERVICE_CLIENT_GRANT_POLICY],
})
export class AuthModule {}
