import type { Lead } from './lead-email-finder'
import type Redis from 'ioredis'

export enum EmailFormatType {
    FirstNameDotLastName,
    FirstInitialLastName,
    FirstInitialDotLastName,
    FirstNameLastName,
    FirstNameLastInitial,
    LastName,
    FirstNameDotLastInitial,
    LastNameDotFirstName,
    FirstNameUnderscoreLastName,
    LastNameFirstInitial,
    FirstInitialLastInitial,
    LastInitialFirstName,
    LastInitialDotFirstName,
    LastNameFirstName,
    FirstNameDashLastName,
    FirstName,
    FirstInitial,
    FirstInitialDotLastInitial,
}

interface Email {
    address: string
    formatType: EmailFormatType
}

export function generateEmails(lead: Lead): Email[] {
    const { firstName, lastName, domain } = lead
    const firstInitial = firstName.charAt(0)
    const lastInitial = lastName.charAt(0)

    const formatToEmailMap = {
        [EmailFormatType.FirstNameDotLastName]: `${firstName}.${lastName}@${domain}`,
        [EmailFormatType.FirstInitialLastName]: `${firstInitial}${lastName}@${domain}`,
        [EmailFormatType.FirstInitialDotLastName]: `${firstInitial}.${lastName}@${domain}`,
        [EmailFormatType.FirstNameLastName]: `${firstName}${lastName}@${domain}`,
        [EmailFormatType.FirstNameLastInitial]: `${firstName}${lastInitial}@${domain}`,
        [EmailFormatType.LastName]: `${lastName}@${domain}`,
        [EmailFormatType.FirstNameDotLastInitial]: `${firstName}.${lastInitial}@${domain}`,
        [EmailFormatType.LastNameDotFirstName]: `${lastName}.${firstName}@${domain}`,
        [EmailFormatType.FirstName]: `${firstName}@${domain}`,
        [EmailFormatType.FirstInitialDotLastInitial]: `${firstInitial}.${lastInitial}@${domain}`,
        [EmailFormatType.FirstNameUnderscoreLastName]: `${firstName}_${lastName}@${domain}`,
        [EmailFormatType.LastNameFirstInitial]: `${lastName}${firstInitial}@${domain}`,
        [EmailFormatType.FirstInitialLastInitial]: `${firstInitial}${lastInitial}@${domain}`,
        [EmailFormatType.LastInitialFirstName]: `${lastInitial}${firstName}@${domain}`,
        [EmailFormatType.LastInitialDotFirstName]: `${lastInitial}.${firstName}@${domain}`,
        [EmailFormatType.LastNameFirstName]: `${lastName}${firstName}@${domain}`,
        [EmailFormatType.FirstNameDashLastName]: `${firstName}-${lastName}@${domain}`,
        [EmailFormatType.FirstInitial]: `${firstInitial}@${domain}`,
    }

    const emails: Email[] = []

    for (const [key, value] of Object.entries(formatToEmailMap)) {
        emails.push({
            address: value,
            formatType: EmailFormatType[key as keyof typeof EmailFormatType],
        })
    }

    return emails
}

class EmailFormatManager {
    private readonly emailFormatPrefix: string = 'emailFormat:'

    constructor(private readonly redis: Redis) {
    }

    async incrementScore(
        domain: string,
        emailFormatType: EmailFormatType,
    ): Promise<void> {
        await this.redis.zincrby(
            `${this.emailFormatPrefix}${domain}`,
            1,
            emailFormatType,
        )
    }

    async getEmailFormatsPriorityForDomain(
        domain: string,
    ): Promise<EmailFormatType[]> {
        const result = await this.redis.zrevrange(
            `${this.emailFormatPrefix}${domain}`,
            0,
            -1,
        )

        if (result.length === 0) {
            await this.initializeEmailFormatsSet(domain)
            return Object.values(EmailFormatType) as EmailFormatType[]
        }

        return result.map(
            value => EmailFormatType[value as keyof typeof EmailFormatType],
        )
    }

    private async initializeEmailFormatsSet(domain: string): Promise<void> {
        for await (const format of Object.values(EmailFormatType)) {
            this.redis.zadd(`${this.emailFormatPrefix}${domain}`, 0, format)
        }
    }
}
