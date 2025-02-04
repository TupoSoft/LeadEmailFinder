export class InvalidAuthDataError extends Error {
    name = 'InvalidAuthDataError'

    constructor() {
        super('Invalid email or password')
    }
}
