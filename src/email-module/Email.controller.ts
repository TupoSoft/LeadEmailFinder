import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common'
import { CreateEmailRequestDto, UpdateEmailRequestDto } from './dto'
import { Email } from './Email.schema'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

@Controller('emails')
export class EmailController {
    constructor(@InjectModel(Email.name) private readonly emailModel: Model<Email>) {}

    @Post()
    @HttpCode(201)
    async createEmail(@Body() { email, exists, format }: CreateEmailRequestDto): Promise<Email> {
        const [username, domain] = email.split('@')
        const createdAt = new Date()

        return await this.emailModel.insertOne({
            _id: email,
            exists,
            format,
            domain,
            username,
            createdAt,
            updatedAt: createdAt,
        })
    }

    @Get()
    async getEmails(): Promise<Email[]> {
        return await this.emailModel.find().exec()
    }

    @Get(':email')
    async getEmail(@Param('email') email: string): Promise<Email> {
        const emailModel = await this.emailModel.findById(email).exec()
        if (emailModel == null) {
            throw new NotFoundException(`The email ${email} was not found`)
        }
        return emailModel
    }

    @Patch(':email')
    async updateEmail(
        @Param('email') email: string,
        @Body() updateEmailRequestDto: UpdateEmailRequestDto,
    ): Promise<Email> {
        const updatedEmail = await this.emailModel
            .findOneAndUpdate({ _id: email }, { $set: updateEmailRequestDto })
            .exec()
        if (updatedEmail == null) {
            throw new NotFoundException(`The email ${email} was not found`)
        }
        return updatedEmail
    }
}
