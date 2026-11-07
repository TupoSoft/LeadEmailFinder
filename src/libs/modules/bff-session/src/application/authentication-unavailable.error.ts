/** A redacted infrastructure failure; transport boundaries map it to the stable authentication 503. */
export class AuthenticationUnavailableError extends Error {
    constructor() {
        super('Authentication is unavailable')
        this.name = 'AuthenticationUnavailableError'
    }
}
