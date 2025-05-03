import { InjectModel } from '@nestjs/mongoose'
import { Email } from './email.schema'
import { Model } from 'mongoose'
import { CreateEmailOptions, IEmailService, UpdateEmailOptions } from './interfaces'
import { Injectable } from '@nestjs/common'
import { EmailAlreadyExistsException, EmailNotFoundException } from './exceptions'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { EmailResponseDto } from './dto'

@Injectable()
export class EmailService implements IEmailService {
    constructor(
        @InjectModel(Email.name) private readonly emailModel: Model<Email>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async createEmail({ email, exists, format }: CreateEmailOptions): Promise<EmailResponseDto> {
        const [username, domain] = email.split('@')
        const createdAt = new Date()

        if (await this.emailModel.exists({ _id: email })) {
            throw new EmailAlreadyExistsException({ email })
        }

        const emailDoc = await this.emailModel.insertOne({
            _id: email,
            exists,
            format,
            domain,
            username,
            createdAt,
            updatedAt: createdAt,
        })

        return this.mapper.map(emailDoc, Email, EmailResponseDto)
    }

    async getEmails(): Promise<EmailResponseDto[]> {
        const emailDocs = await this.emailModel.find().exec()
        return this.mapper.mapArray(emailDocs, Email, EmailResponseDto)
    }

    async getEmail(email: string): Promise<EmailResponseDto> {
        const emailModel = await this.emailModel.findById(email).exec()

        if (emailModel == null) {
            throw new EmailNotFoundException({ email })
        }

        return this.mapper.map(emailModel, Email, EmailResponseDto)
    }

    async updateEmail(email: string, { format, exists }: UpdateEmailOptions): Promise<EmailResponseDto> {
        const updatedEmail = await this.emailModel
            .findOneAndUpdate(
                { _id: email },
                {
                    $set: {
                        format,
                        exists,
                    },
                },
                { new: true, upsert: true },
            )
            .exec()

        if (updatedEmail == null) {
            throw new EmailNotFoundException({ email })
        }

        return this.mapper.map(updatedEmail, Email, EmailResponseDto)
    }
}
