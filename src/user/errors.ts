import type { User } from './entity'

export class UserNotFoundError extends Error {
    name = 'UserNotFoundError'

    constructor(property: keyof User, value: string) {
        super(`There is no user with ${property} ${value}`)
    }
}

export class UserNotDeletedError extends Error {
    name = 'UserNotDeletedError'

    constructor(id: string) {
        super(`The deletion of user ${id} failed`)
    }
}
