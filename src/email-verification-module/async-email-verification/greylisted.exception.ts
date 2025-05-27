export class GreylistedException extends Error {
    name = 'GreylistedException'

    constructor(email: string) {
        super(`Email ${email} is greylisted.`)
    }
}
