import { IsEmail } from 'class-validator'

const host_blacklist = ['localhost', 'tuposoft.com', 'leademailfinder.com']

export function IsVerifiableEmail(): PropertyDecorator {
    return function (target, propertyKey) {
        IsEmail({ host_blacklist })(target, propertyKey)
    }
}
