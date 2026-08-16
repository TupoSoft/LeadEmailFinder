import { Module } from '@nestjs/common'
import { EmailController } from './email.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Email } from './email.entity'
import { EmailService } from './email.service'
import { EMAIL_SERVICE_TOKEN } from './email.constants'
import { EmailProfile } from './email.profile'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'

@Module({
    imports: [TypeOrmModule.forFeature([Email])],
    controllers: [EmailController],
    providers: [
        {
            provide: EMAIL_SERVICE_TOKEN,
            useExisting: EmailService,
        },
        EmailService,
        EmailProfile,
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    exports: [EmailService],
})
export class EmailModule {}
