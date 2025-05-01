import { Module } from '@nestjs/common'
import { EmailController } from './Email.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Email, EmailSchema } from './Email.schema'

@Module({
    imports: [MongooseModule.forFeature([{ name: Email.name, schema: EmailSchema }])],
    controllers: [EmailController],
    exports: [MongooseModule],
})
export class EmailModule {}
