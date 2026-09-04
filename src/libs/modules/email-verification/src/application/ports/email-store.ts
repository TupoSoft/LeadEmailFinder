import { Email, EmailUpdate } from '../../domain/email'

export const EMAIL_STORE = Symbol('EMAIL_STORE')

export interface NewEmail {
    id: string
    exists: boolean | null
    format?: Email['format']
}

export interface EmailStore {
    findByAddress(organizationId: string, address: string): Promise<Email | null>

    findAllForOrganization(organizationId: string): Promise<Email[]>

    create(organizationId: string, email: NewEmail): Promise<Email>

    update(organizationId: string, address: string, changes: EmailUpdate): Promise<Email | null>

    upsert(organizationId: string, address: string, changes: EmailUpdate): Promise<Email>
}
