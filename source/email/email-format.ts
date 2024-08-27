import type Redis from 'ioredis'
import type { Lead } from './lead-email-finder'

export const enum EmailFormatType {
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

const emailFormatTypes = [
    EmailFormatType.FirstNameDotLastName,
    EmailFormatType.FirstInitialLastName,
    EmailFormatType.FirstInitialDotLastName,
    EmailFormatType.FirstNameLastName,
    EmailFormatType.FirstNameLastInitial,
    EmailFormatType.LastName,
    EmailFormatType.FirstNameDotLastInitial,
    EmailFormatType.LastNameDotFirstName,
    EmailFormatType.FirstNameUnderscoreLastName,
    EmailFormatType.LastNameFirstInitial,
    EmailFormatType.FirstInitialLastInitial,
    EmailFormatType.LastInitialFirstName,
    EmailFormatType.LastInitialDotFirstName,
    EmailFormatType.LastNameFirstName,
    EmailFormatType.FirstNameDashLastName,
    EmailFormatType.FirstName,
    EmailFormatType.FirstInitial,
    EmailFormatType.FirstInitialDotLastInitial,
]

const deprioritizedEmailFormatTypes = [
    EmailFormatType.FirstName,
    EmailFormatType.LastName,
    EmailFormatType.FirstInitial,
]

export function generateEmails(lead: Lead): Record<EmailFormatType, string> {
    const { firstName, lastName, domain } = lead
    const firstInitial = firstName?.charAt(0) ?? ''
    const lastInitial = lastName?.charAt(0) ?? ''

    return {
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
}

export class EmailFormatManager {
    private readonly emailFormatPrefix: string = 'emailFormat:'
    private readonly matchedEmailsPrefix: string = 'matchedEmails:'

    constructor(private readonly redis: Redis) {}

    static isDeprioritized(emailFormatType: EmailFormatType): boolean {
        return deprioritizedEmailFormatTypes.includes(emailFormatType)
    }

    async incrementScore(email: string, formatType: EmailFormatType): Promise<void> {
        const [, domain] = email.split('@')
        const result = await this.redis.sadd(`${this.matchedEmailsPrefix}${domain}`, email)

        const isNewMatch = result === 1

        if (isNewMatch && !EmailFormatManager.isDeprioritized(formatType)) {
            await this.redis.zincrby(`${this.emailFormatPrefix}${domain}`, 1, formatType)
        }
    }

    async getSet(domain: string): Promise<EmailFormatType[]> {
        const sortedSet = await this.redis.zrevrange(`${this.emailFormatPrefix}${domain}`, 0, -1)

        if (sortedSet.length === 0) {
            return emailFormatTypes
        }

        const containing = sortedSet.map(value => emailFormatTypes[parseInt(value)])
        const others = emailFormatTypes.filter(value => !containing.includes(value))

        return [...containing, ...others]
    }
}
