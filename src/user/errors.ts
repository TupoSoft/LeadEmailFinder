import type { User } from './entity'

export class UserNotFoundError<K extends keyof User> extends Error {
    name = 'UserNotFoundError'

    constructor(property: K, value: User[K]) {
        super(`There is no user with ${property} ${value.toString()}`)
    }
}

export class UserAlreadyExistsError extends Error {
    name = 'UserAlreadyExistsError'

    constructor(email: string) {
        super(`The user with email ${email} already exists`)
    }
}
