import { IsEmail } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

const host_blacklist = ['localhost', 'tuposoft.com', 'leademailfinder.com']

export function IsVerifiableEmail(): PropertyDecorator {
    return function (target, propertyKey): void {
        ApiProperty({ example: 'danilo@microsoft.com', format: 'email' })(target, propertyKey)
        IsEmail({ host_blacklist })(target, propertyKey)
    }
}
