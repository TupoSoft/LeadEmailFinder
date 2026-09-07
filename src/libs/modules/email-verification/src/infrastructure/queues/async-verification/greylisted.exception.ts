export class GreylistedException extends Error {
    name = 'GreylistedException'

    constructor(_email: string) {
        super('Email verification is temporarily greylisted.')
    }
}
