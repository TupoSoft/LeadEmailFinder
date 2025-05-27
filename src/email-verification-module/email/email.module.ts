import { Module } from '@nestjs/common'
import { EmailController } from './email.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Email, EmailSchema } from './email.schema'
import { EmailService } from './email.service'
import { EMAIL_SERVICE_TOKEN } from './email.constants'
import { EmailProfile } from './email.profile'

@Module({
    imports: [MongooseModule.forFeature([{ name: Email.name, schema: EmailSchema }])],
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
