export class KeyNotFound extends Error {
    name = 'KeyNotFound'
    constructor(id: string) {
        super(`Key ${id} was not found`)
    }
}

export class AdminTokenRevocationForbidden extends Error {
    name = 'AdminTokenRevocationForbidden'
    constructor(message: string) {
        super(message)
    }
}
