import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { IsEnum, IsString } from 'class-validator'

@WithFileVars()
export class EnvironmentVariablesDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    APIKEY_MONGO_URL: string
}
