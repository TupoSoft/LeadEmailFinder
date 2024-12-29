import type { User } from './entity'

export class UserNotFoundError extends Error {
    name = 'UserNotFoundError'

    constructor(property: keyof User, value: string) {
        super(`The user ${property} with value ${value} does not exist`)
    }
}

export class UserNotDeletedError extends Error {
    name = 'UserNotDeletedError'

    constructor(id: string) {
        super(`The deletion of user ${id} failed`)
    }
}
