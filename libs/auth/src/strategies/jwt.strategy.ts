import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserService } from '../user/user.service'

export interface JwtPayload {
    sub: string
    email: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private userService: UserService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        })
    }

    async validate(payload: JwtPayload) {
        const user = await this.userService.findById(payload.sub)
        if (!user || !user.isActive) {
            throw new UnauthorizedException()
        }
        return user
    }
}
