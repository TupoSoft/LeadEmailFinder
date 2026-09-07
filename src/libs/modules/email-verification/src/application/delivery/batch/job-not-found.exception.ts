export class BatchEmailVerificationJobNotFoundException extends Error {
    name = 'BatchEmailVerificationJobNotFoundException'

    constructor(id: string) {
        super(`Job with id "${id}" not found.`)
    }
}
