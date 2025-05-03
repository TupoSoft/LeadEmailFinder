import { InjectModel } from '@nestjs/mongoose'
import { Email } from './Email.schema'
import { Model } from 'mongoose'
import { CreateEmailOptions, IEmailService, UpdateEmailOptions } from './interfaces'
import { Injectable } from '@nestjs/common'
import { EmailNotFoundException } from './exceptions'

@Injectable()
export class EmailService implements IEmailService {
    constructor(@InjectModel(Email.name) private readonly emailModel: Model<Email>) {}

    async createEmail({ email, exists, format }: CreateEmailOptions): Promise<Email> {
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

    async getEmails(): Promise<Email[]> {
        return await this.emailModel.find().exec()
    }

    async getEmail(email: string): Promise<Email> {
        const emailModel = await this.emailModel.findById(email).exec()

        if (emailModel == null) {
            throw new EmailNotFoundException({ email })
        }

        return emailModel
    }

    async updateEmail(email: string, { format, exists }: UpdateEmailOptions): Promise<Email> {
        const updatedEmail = await this.emailModel.findOneAndUpdate({ _id: email }, { $set: { format, exists } }).exec()

        if (updatedEmail == null) {
            throw new EmailNotFoundException({ email })
        }

        return updatedEmail
    }
}
