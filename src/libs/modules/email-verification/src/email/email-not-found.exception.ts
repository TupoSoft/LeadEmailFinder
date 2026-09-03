interface EmailNotFoundExceptionConstructorOptions {
    email: string
}

export class EmailNotFoundException extends Error {
    name = 'EmailNotFoundException'

    constructor(_options: EmailNotFoundExceptionConstructorOptions) {
        super('Email not found.')
    }
}
