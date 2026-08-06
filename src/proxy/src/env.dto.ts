import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { IsEnum, IsString } from 'class-validator'

@WithFileVars()
export class EnvDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    POSTGRES_URL: string
}
