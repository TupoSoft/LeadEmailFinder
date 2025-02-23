import type { CreateEmailRecord, UpdateEmailRequest } from './dto'
import type { EmailPattern } from './enums'

export interface EmailRecord {
    readonly email: string
    readonly username: string
    readonly domain: string
    exists: boolean | null
    format?: EmailPattern
    lastVerificationId?: string
    readonly createdAt: Date
    readonly updatedAt: Date
}

export interface FindAllFilters {
    domain?: string
    exists?: boolean | null
    format?: EmailPattern
    formatDefined?: boolean
}

export interface EmailRepository {
    findAll: (filters?: FindAllFilters) => Promise<EmailRecord[]>
    findByIdOrCreate: (createEmailRecord: CreateEmailRecord) => Promise<EmailRecord>
    findById: (id: string) => Promise<EmailRecord | null>
    save: (createEmailDto: CreateEmailRecord) => Promise<EmailRecord>
    update: (id: string, updateEmailDto: UpdateEmailRequest) => Promise<EmailRecord | null>
    delete: (id: string) => Promise<EmailRecord | null>
}
