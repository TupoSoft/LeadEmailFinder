import { Module } from '@nestjs/common'
import { EmailController } from './Email.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Email, EmailSchema } from './Email.schema'
import { EmailService } from './Email.service'
import { EMAIL_SERVICE_TOKEN } from './Email.constants'

@Module({
    imports: [MongooseModule.forFeature([{ name: Email.name, schema: EmailSchema }])],
    controllers: [EmailController],
    providers: [
        {
            provide: EMAIL_SERVICE_TOKEN,
            useClass: EmailService,
        },
    ],
    exports: [EMAIL_SERVICE_TOKEN],
})
export class EmailModule {}
