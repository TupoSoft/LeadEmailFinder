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

    async createEmail(
        organizationId: string,
        { email, exists, format }: ICreateEmailRequestDto,
    ): Promise<IEmailResponseDto> {
        email = EmailService.normalizeEmail(email)
        const [username, domain] = email.split('@')

        if (await this.emailRepo.existsBy({ organizationId, id: email })) {
            throw new EmailAlreadyExistsException({ email })
        }

        const emailEntity = await this.emailRepo.save(
            this.emailRepo.create({ organizationId, id: email, exists, format, domain, username }),
        )

        return this.mapper.map(emailEntity, Email, EmailResponseDto)
    }

    async getEmails(organizationId: string): Promise<IEmailResponseDto[]> {
        const emails = await this.emailRepo.find({ where: { organizationId } })
        return this.mapper.mapArray(emails, Email, EmailResponseDto)
    }

    async getEmail(organizationId: string, email: string): Promise<IEmailResponseDto> {
        email = EmailService.normalizeEmail(email)
        const emailEntity = await this.emailRepo.findOneBy({ organizationId, id: email })

        if (emailEntity == null) {
            throw new EmailNotFoundException({ email })
        }

        return this.mapper.map(emailEntity, Email, EmailResponseDto)
    }

    async updateEmail(
        organizationId: string,
        email: string,
        options: IUpdateEmailRequestDto,
    ): Promise<IEmailResponseDto> {
        email = EmailService.normalizeEmail(email)
        const emailEntity = await this.emailRepo.findOneBy({ organizationId, id: email })

        if (emailEntity == null) {
            throw new EmailNotFoundException({ email })
        }

        EmailService.applyUpdates(emailEntity, options)
        const saved = await this.emailRepo.save(emailEntity)

        return this.mapper.map(saved, Email, EmailResponseDto)
    }

    async upsertEmail(
        organizationId: string,
        email: string,
        options: IUpdateEmailRequestDto,
    ): Promise<IEmailResponseDto> {
        email = EmailService.normalizeEmail(email)
        const [username, domain] = email.split('@')

        let emailEntity = await this.emailRepo.findOneBy({ organizationId, id: email })

        if (emailEntity == null) {
            emailEntity = this.emailRepo.create({
                organizationId,
                id: email,
                username,
                domain,
                exists: null,
            })
        }

        EmailService.applyUpdates(emailEntity, options)
        const saved = await this.emailRepo.save(emailEntity)

        return this.mapper.map(saved, Email, EmailResponseDto)
    }

    private static normalizeEmail(email: string): string {
        return email.toLowerCase()
    }

    private static applyUpdates(email: Email, { format, exists, lastVerificationId }: IUpdateEmailRequestDto): void {
        if (format !== undefined) {
            email.format = format
        }

        if (exists !== undefined) {
            email.exists = exists
        }

        if (lastVerificationId !== undefined) {
            email.lastVerificationId = lastVerificationId
        }
    }
}
