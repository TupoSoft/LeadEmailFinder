import { IsEnum, IsString } from 'class-validator'
import { IsFileVar, WithFileVars } from './file-vars.decorator'

enum Environment {
    Development = 'development',
    Production = 'production',
}

@WithFileVars()
export class EnvironmentVariablesDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    REDIS_URL: string

    @IsFileVar()
    @IsString()
    MONGO_URL: string

    @IsFileVar()
    @IsString()
    CATCH_ALL_HTTP_PROXY_URL: string
}
