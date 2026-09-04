import { Email, EmailUpdate } from '../domain/email'
import { EmailAlreadyExistsError, EmailNotFoundError } from '../domain/errors'
import { EmailStore } from './ports/email-store'

export interface CreateEmailCommand {
    email: string
    exists: boolean | null
    format?: Email['format']
}

export class EmailAdministrationService {
    constructor(private readonly store: EmailStore) {}

    async createEmail(organizationId: string, { email, exists, format }: CreateEmailCommand): Promise<Email> {
        email = EmailAdministrationService.normalize(email)

        if ((await this.store.findByAddress(organizationId, email)) !== null) {
            throw new EmailAlreadyExistsError(email)
        }

        return this.store.create(organizationId, { id: email, exists, format })
    }

    async getEmails(organizationId: string): Promise<Email[]> {
        return this.store.findAllForOrganization(organizationId)
    }

    async getEmail(organizationId: string, email: string): Promise<Email> {
        email = EmailAdministrationService.normalize(email)
        const found = await this.store.findByAddress(organizationId, email)

        if (found === null) {
            throw new EmailNotFoundError(email)
        }

        return found
    }

    async updateEmail(organizationId: string, email: string, changes: EmailUpdate): Promise<Email> {
        email = EmailAdministrationService.normalize(email)
        const updated = await this.store.update(organizationId, email, changes)

        if (updated === null) {
            throw new EmailNotFoundError(email)
        }

        return updated
    }

    async upsertEmail(organizationId: string, email: string, changes: EmailUpdate): Promise<Email> {
        email = EmailAdministrationService.normalize(email)
        return this.store.upsert(organizationId, email, changes)
    }

    private static normalize(email: string): string {
        return email.toLowerCase()
    }
}
