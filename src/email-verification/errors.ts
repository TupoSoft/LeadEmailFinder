export class JobNotFoundError extends Error {
    name = 'JobNotFoundError'

    constructor(id: string) {
        super(`The job ${id} does not exist`)
    }
}
