export interface IConfigService<T> {
    get: <K extends keyof T>(key: K) => T[K]
    has: (key: keyof T) => boolean
}

export class ConfigService<T extends object> implements IConfigService<T> {
    constructor(private readonly config: Readonly<T>) {}

    has: (key: keyof T) => boolean = key => key in this.config

    get: <K extends keyof T>(key: K) => T[K] = key => {
        if (!this.has(key)) {
            throw new Error(`Configuration key "${String(key)}" is not defined.`)
        }

        return this.config[key]
    }
}
