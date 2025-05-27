interface ConstructorOptions {
    email: string
}

export class EmailAlreadyExistsException extends Error {
    name = 'EmailAlreadyExistsException'

    constructor({ email }: ConstructorOptions) {
        super(`Email ${email} already exists`)
    }
}
