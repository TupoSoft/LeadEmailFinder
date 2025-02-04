import type { IUserService } from '../user'
import type { AuthData, LoginResult, RefreshData } from './dto'
import { compare, hash } from './util/password'
import { InvalidAuthDataError } from './errors'
import type { User } from '../user/entity'
import { UserNotFoundError } from '../user/errors'
import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import type { JwtService } from './jwt'

export interface IAuthService {
    register: (registrationData: AuthData) => Promise<void>
    login: (authData: AuthData) => Promise<LoginResult>
    refresh: (refreshData: RefreshData) => string
}

export class AuthService implements IAuthService {
    constructor(
        private readonly userService: IUserService,
        private readonly jwtService: JwtService,
    ) {}

    private static async checkPassword(password: string, saltedHash: string): Promise<boolean> {
        try {
            return await compare(password, saltedHash)
        } catch (error) {
            return false
        }
    }

    async login(authData: AuthData): Promise<LoginResult> {
        const { email, password } = authData
        const user = await this.getUserByEmail(email)

        const match = await AuthService.checkPassword(password, user.password)
        if (!match) {
            throw new InvalidAuthDataError()
        }

        const token = this.jwtService.signJwt({ sub: user.id })

        return { token }
    }

    refresh(refreshData: RefreshData): string {
        return await this.jwtService.refreshAccessToken(refreshData)
    }

    async register(authData: AuthData): Promise<void> {
        const { email, password } = authData
        const hashedPassword = await hash(password)

        await this.userService.create({
            email,
            password: hashedPassword,
        })
    }

    private async getUserByEmail(email: string): Promise<User> {
        try {
            return await this.userService.getByEmail(email)
        } catch (error) {
            if (error instanceof UserNotFoundError) {
                throw new InvalidAuthDataError()
            } else {
                ok(isNativeError(error), new Error(String(error)))
                throw error
            }
        }
    }
}
