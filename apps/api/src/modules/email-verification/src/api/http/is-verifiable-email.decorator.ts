import { isEmail, ValidateBy } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { verificationEmailSchema } from '@tuposoft/lead-email-finder-verification-contracts'

const host_blacklist = ['localhost', 'tuposoft.com', 'leademailfinder.com']

export function IsVerifiableEmail(): PropertyDecorator {
    return function (target, propertyKey): void {
        ApiProperty({ example: 'danilo@microsoft.com', format: 'email' })(target, propertyKey)
        ValidateBy({
            name: 'isEmail',
            validator: {
                validate: (value: unknown) =>
                    verificationEmailSchema.safeParse(value).success && isEmail(value, { host_blacklist }),
                defaultMessage: () => '$property must be an email',
            },
        })(target, propertyKey)
    }
}
