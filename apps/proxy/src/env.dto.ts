import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { IsEnum, IsUrl } from 'class-validator'

@WithFileVars()
export class EnvDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsUrl({ protocols: ['mongodb'], require_protocol: true })
    MONGO_URL: string
}
