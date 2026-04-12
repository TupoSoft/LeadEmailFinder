import { InjectModel } from '@nestjs/mongoose'
import { Email } from './email.schema'
import {
    ICreateEmailRequestDto,
    IEmailResponseDto,
    IEmailService,
    IUpdateEmailRequestDto,
} from '@tuposoft/lead-email-finder/common'
import { Injectable } from '@nestjs/common'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { Model } from 'mongoose'
import { EmailAlreadyExistsException } from './email-already-exists.exception'
import { EmailResponseDto } from './email-response.dto'
import { EmailNotFoundException } from './email-not-found.exception'

@Injectable()
export class EmailService implements IEmailService {
    constructor(
        @InjectModel(Email.name) private readonly emailModel: Model<Email>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async createEmail({ email, exists, format }: ICreateEmailRequestDto): Promise<IEmailResponseDto> {
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

    async getEmails(): Promise<IEmailResponseDto[]> {
        const emailDocs = await this.emailModel.find().exec()
        return this.mapper.mapArray(emailDocs, Email, EmailResponseDto)
    }

    async getEmail(email: string): Promise<IEmailResponseDto> {
        const emailModel = await this.emailModel.findById(email).exec()

        if (emailModel == null) {
            throw new EmailNotFoundException({ email })
        }

        return this.mapper.map(emailModel, Email, EmailResponseDto)
    }

    async updateEmail(email: string, { format, exists }: IUpdateEmailRequestDto): Promise<IEmailResponseDto> {
        const [username, domain] = email.split('@')

        const updatedEmail = await this.emailModel
            .findOneAndUpdate(
                { _id: email },
                {
                    $set: {
                        format,
                        exists,
                    },
                    $setOnInsert: {
                        username,
                        domain,
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
