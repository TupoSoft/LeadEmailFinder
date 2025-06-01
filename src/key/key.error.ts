export class KeyNotFound extends Error {
    name = 'KeyNotFound'
    constructor(message: string) {
        super(message)
    }
}

export class AdminTokenRevocationForbidden extends Error {
    name = 'AdminTokenRevocationForbidden'
    constructor(message: string) {
        super(message)
    }
}
