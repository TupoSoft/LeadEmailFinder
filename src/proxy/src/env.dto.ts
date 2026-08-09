import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { IsBoolean, IsEnum, IsString } from 'class-validator'
import { Transform } from 'class-transformer'

@WithFileVars()
export class EnvDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    POSTGRES_URL: string

    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    TYPEORM_SYNCHRONIZE: boolean = false
}
