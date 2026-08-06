import { Module } from '@nestjs/common'
import { EmailController } from './email.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Email } from './email.entity'
import { EmailService } from './email.service'
import { EMAIL_SERVICE_TOKEN } from './email.constants'
import { EmailProfile } from './email.profile'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [TypeOrmModule.forFeature([Email]), ApiKeyModule],
    controllers: [EmailController],
    providers: [
        {
            provide: EMAIL_SERVICE_TOKEN,
            useExisting: EmailService,
        },
        EmailService,
        EmailProfile,
    ],
    exports: [EmailService],
})
export class EmailModule {}
