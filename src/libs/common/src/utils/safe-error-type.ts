const ERROR_TYPE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

export function safeErrorType(error: unknown): string {
    if (!(error instanceof Error)) {
        return 'UnknownError'
    }

    try {
        const errorConstructor: unknown = error.constructor
        const constructorName = typeof errorConstructor === 'function' ? errorConstructor.name : ''
        return ERROR_TYPE_PATTERN.test(constructorName) ? constructorName : 'Error'
    } catch {
        return 'Error'
    }
}
