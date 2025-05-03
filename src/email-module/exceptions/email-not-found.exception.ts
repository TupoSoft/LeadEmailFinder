interface EmailNotFoundExceptionConstructorOptions {
    email: string
}

export class EmailNotFoundException extends Error {
    name = 'EmailNotFoundException'

    constructor({ email }: EmailNotFoundExceptionConstructorOptions) {
        super(`Email ${email} not found`)
    }
}
