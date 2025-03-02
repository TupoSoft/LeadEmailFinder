import type { CreateEmailRecord, UpdateEmailRecord } from './dto'
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
    readonly lastVerifiedAt?: Date
}

export interface FindAllFilters {
    domain?: string
    exists?: boolean | null
    format?: EmailPattern
    formatExists?: boolean
}

export interface EmailRepository {
    findAll: (filters?: FindAllFilters) => Promise<EmailRecord[]>
    findByIdOrCreate: (createEmailRecord: CreateEmailRecord) => Promise<EmailRecord>
    findById: (id: string) => Promise<EmailRecord | null>
    save: (createEmailDto: CreateEmailRecord) => Promise<EmailRecord>
    update: (id: string, updateEmailRecord: UpdateEmailRecord) => Promise<EmailRecord | null>
    delete: (id: string) => Promise<EmailRecord | null>
}
