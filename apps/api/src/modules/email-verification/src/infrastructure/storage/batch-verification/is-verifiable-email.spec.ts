import { validateSync } from 'class-validator'
import { IsVerifiableEmail } from './is-verifiable-email.decorator'

class Row {
    email!: string
}
IsVerifiableEmail()(Row.prototype, 'email')

describe('IsVerifiableEmail', () => {
    it('accepts wire-supported addresses and rejects blocked hosts and unsupported SMTPUTF8 before funding', () => {
        const validate = (email: string): boolean => validateSync(Object.assign(new Row(), { email })).length === 0
        expect(validate('john.doe@example.com')).toBe(true)
        expect(validate('john.doe@tuposoft.com')).toBe(false)
        expect(validate('δοκιμή@example.com')).toBe(false)
    })
})
