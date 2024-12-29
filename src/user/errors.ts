import type { User } from './entity'

export class UserNotFoundError<K extends keyof User> extends Error {
    name = 'UserNotFoundError'

    constructor(property: K, value: User[K]) {
        super(`There is no user with ${property} ${value.toString()}`)
    }
}
