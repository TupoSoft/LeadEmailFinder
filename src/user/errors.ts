import type { User } from './entity'

export class UserNotFoundError<K extends keyof User> extends Error {
    name = 'UserNotFoundError'

    constructor(property: K, value: User[K]) {
        super(`There is no user with ${property} ${value.toString()}`)
    }
}

export class UserNotDeletedError extends Error {
    name = 'UserNotDeletedError'

    constructor(id: string) {
        super(`The deletion of user ${id} failed`)
    }
}
