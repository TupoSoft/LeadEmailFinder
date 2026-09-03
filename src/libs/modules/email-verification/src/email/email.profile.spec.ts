import { classes } from '@automapper/classes'
import { createMapper } from '@automapper/core'
import { Email } from './email.entity'
import { EmailProfile } from './email.profile'
import { EmailResponseDto } from './email-response.dto'

describe('EmailProfile', () => {
    it.each([false, true, null])('preserves the nullable exists value in API responses: %s', async exists => {
        const mapper = createMapper({ strategyInitializer: classes() })
        new EmailProfile(mapper)
        await Promise.resolve()

        const email = Object.assign(new Email(), {
            organizationId: '10000000-0000-4000-8000-000000000001',
            id: 'person@example.test',
            username: 'person',
            domain: 'example.test',
            exists,
            createdAt: new Date('2026-09-03T00:00:00.000Z'),
            updatedAt: new Date('2026-09-03T00:00:00.000Z'),
        })

        expect(mapper.map(email, Email, EmailResponseDto)).toEqual(
            expect.objectContaining({
                email: 'person@example.test',
                exists,
            }),
        )
    })
})
