import 'reflect-metadata'
import { Contains, ValidateIf } from 'class-validator'

const FILE_VARS_KEY = Symbol('env:file-vars')

type FileVarCondition = (object: Record<string, unknown>) => boolean

interface FileVarMetadata {
    property: string
    requiredWhen: FileVarCondition
}

export function WithFileVars(): ClassDecorator {
    return function (target): typeof target {
        const prototype: unknown = target.prototype

        if (typeof prototype !== 'object' || prototype === null) {
            throw new Error('The @WithFileVars decorator can only be used on classes')
        }

        const props = (Reflect.getMetadata(FILE_VARS_KEY, target) as FileVarMetadata[] | undefined) ?? []

        for (const { property: prop, requiredWhen } of props) {
            const fileProp = `${prop}_FILE`

            Object.defineProperty(target, fileProp, {
                writable: true,
                enumerable: true,
                configurable: true,
            })

            Contains('/run/secrets')(prototype, fileProp)
            ValidateIf((object: Record<string, unknown>) => requiredWhen(object) && object[fileProp] === undefined)(
                prototype,
                prop,
            )
            ValidateIf((object: Record<string, unknown>) => requiredWhen(object) && object[prop] === undefined)(
                prototype,
                fileProp,
            )
        }

        return target
    }
}

export function IsFileVar(requiredWhen: FileVarCondition = () => true): PropertyDecorator {
    return (target, propertyKey): void => {
        const propertyKeyString = propertyKey.toString()
        const existing = (Reflect.getMetadata(FILE_VARS_KEY, target.constructor) as FileVarMetadata[]) || []
        existing.push({ property: propertyKeyString, requiredWhen })
        Reflect.defineMetadata(FILE_VARS_KEY, existing, target.constructor)
    }
}
