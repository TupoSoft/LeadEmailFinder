import { IsVerifiableEmail } from './is-verifiable-email.decorator'
import { IsEmail } from 'class-validator'

jest.mock('class-validator', () => ({
    IsEmail: jest.fn(() => jest.fn()),
}))

const host_blacklist = ['localhost', 'tuposoft.com', 'leademailfinder.com']

describe('IsVerifiableEmail', () => {
    it('should apply IsEmail decorator with a host blacklist', () => {
        const mockTarget = {
            email: 'john.doe@example.com',
        }

        const mockPropertyKey = 'email'

        const decorator = IsVerifiableEmail()
        decorator(mockTarget, mockPropertyKey)

        expect(IsEmail).toHaveBeenCalledWith({ host_blacklist })
    })
})
