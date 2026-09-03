interface ConstructorOptions {
    email: string
}

export class EmailAlreadyExistsException extends Error {
    name = 'EmailAlreadyExistsException'

    constructor(_options: ConstructorOptions) {
        super('Email already exists.')
    }
}
