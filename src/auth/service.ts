import type { IUserService } from '../user'
import type { RegistrationData } from './dto'
import { hash } from './util/password'

export interface IAuthService {
    register: (registrationData: RegistrationData) => Promise<void>
}

export class AuthService implements IAuthService {
    constructor(private readonly userService: IUserService) {}

    async register(registrationData: RegistrationData): Promise<void> {
        const { email, password } = registrationData
        const hashedPassword = await hash(password)

        await this.userService.createUser({
            email,
            password: hashedPassword,
        })
    }
}
