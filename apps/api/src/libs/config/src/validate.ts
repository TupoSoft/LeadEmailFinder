import { ClassConstructor, plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'

export function validate<T extends object, EnvType extends ClassConstructor<T>>(
    envDto: EnvType,
    config: Record<string, unknown>,
): T {
    const validatedConfig = plainToInstance(envDto, config, { enableImplicitConversion: true })
    const errors = validateSync(validatedConfig, { skipMissingProperties: false })

    if (errors.length > 0) {
        throw new Error(errors.toString())
    }

    return validatedConfig
}
