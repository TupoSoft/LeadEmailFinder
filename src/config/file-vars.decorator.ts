import { IsString, ValidateIf } from 'class-validator'

const FILE_VARS_KEY = Symbol('env:file-vars')

export function WithFileVars(): ClassDecorator {
    return function (target): typeof target {
        const prototype: unknown = target.prototype

        if (typeof prototype !== 'object' || prototype === null) {
            throw new Error('The @WithFileVars decorator can only be used on classes')
        }

        const props = (Reflect.getMetadata(FILE_VARS_KEY, target) as string[] | undefined) ?? []

        for (const prop of props) {
            const fileProp = `${prop}_FILE`

            Object.defineProperty(target, fileProp, {
                writable: true,
                enumerable: true,
                configurable: true,
            })

            IsString()(prototype, fileProp)
            ValidateIf((object: Record<string, unknown>) => object[fileProp] === undefined)(prototype, prop)
            ValidateIf((object: Record<string, unknown>) => object[prop] === undefined)(prototype, fileProp)
        }

        return target
    }
}

export function IsFileVar(): PropertyDecorator {
    return (target, propertyKey): void => {
        const propertyKeyString = propertyKey.toString()
        const existing = (Reflect.getMetadata(FILE_VARS_KEY, target.constructor) as string[]) || []
        existing.push(propertyKeyString)
        Reflect.defineMetadata(FILE_VARS_KEY, existing, target.constructor)
    }
}
