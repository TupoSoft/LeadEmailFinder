export class AsyncEmailVerificationJobNotFoundException extends Error {
    name = 'AsyncEmailVerificationJobNotFoundException'

    constructor(id: string) {
        super(`Job with id "${id}" not found.`)
    }
}
