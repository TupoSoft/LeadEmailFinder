import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import { EnvironmentVariablesDto } from './environment-variables.dto'
import { createCustomerObjectWriteSecurity } from './customer-object-write-security.factory'

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN,
            useFactory: (configService: ConfigService<EnvironmentVariablesDto, true>): CustomerObjectWriteSecurity =>
                createCustomerObjectWriteSecurity({
                    NODE_ENV: configService.get('NODE_ENV'),
                    S3_SERVER_SIDE_ENCRYPTION: configService.get('S3_SERVER_SIDE_ENCRYPTION'),
                    S3_KMS_KEY_ID: configService.get('S3_KMS_KEY_ID'),
                }),
            inject: [ConfigService],
        },
    ],
    exports: [CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN],
})
export class CustomerObjectWriteSecurityModule {}
