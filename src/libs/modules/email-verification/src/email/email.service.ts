import { Email } from './email.entity'
import {
    ICreateEmailRequestDto,
    IEmailResponseDto,
    IEmailService,
    IUpdateEmailRequestDto,
} from '@tuposoft/lead-email-finder/common'
import { Injectable } from '@nestjs/common'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EmailAlreadyExistsException } from './email-already-exists.exception'
import { EmailResponseDto } from './email-response.dto'
import { EmailNotFoundException } from './email-not-found.exception'

@Injectable()
export class EmailService implements IEmailService {
    constructor(
        @InjectRepository(Email) private readonly emailRepo: Repository<Email>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async createEmail({ email, exists, format }: ICreateEmailRequestDto): Promise<IEmailResponseDto> {
        const [username, domain] = email.split('@')

        if (await this.emailRepo.existsBy({ id: email })) {
            throw new EmailAlreadyExistsException({ email })
        }

        const emailEntity = await this.emailRepo.save(
            this.emailRepo.create({ id: email, exists, format, domain, username }),
        )

        return this.mapper.map(emailEntity, Email, EmailResponseDto)
    }

    async getEmails(): Promise<IEmailResponseDto[]> {
        const emails = await this.emailRepo.find()
        return this.mapper.mapArray(emails, Email, EmailResponseDto)
    }

    async getEmail(email: string): Promise<IEmailResponseDto> {
        const emailEntity = await this.emailRepo.findOneBy({ id: email })

        if (emailEntity == null) {
            throw new EmailNotFoundException({ email })
        }

        return this.mapper.map(emailEntity, Email, EmailResponseDto)
    }

    async updateEmail(email: string, { format, exists }: IUpdateEmailRequestDto): Promise<IEmailResponseDto> {
        const [username, domain] = email.split('@')

        let emailEntity = await this.emailRepo.findOneBy({ id: email })

        if (emailEntity == null) {
            emailEntity = this.emailRepo.create({ id: email, username, domain, format, exists: exists ?? null })
        } else {
            emailEntity.format = format
            emailEntity.exists = exists ?? null
        }

        const saved = await this.emailRepo.save(emailEntity)

        return this.mapper.map(saved, Email, EmailResponseDto)
    }
}
