export class JobNotFoundException extends Error {
    name = 'AsyncEmailVerificationJobNotFoundException'

    constructor(id: string) {
        super(`Job with id "${id}" not found.`)
    }
}
