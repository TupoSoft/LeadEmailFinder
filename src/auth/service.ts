import { UserService } from '../user'
import { RegistrationData } from './dto'
import { hash } from './password'

export class AuthService {
    constructor(private readonly userService: UserService) {}

    async register(registrationData: RegistrationData): Promise<void> {
        const { email, password } = registrationData
        const hashedPassword = await hash(password)

        await this.userService.createUser({
            email,
            password: hashedPassword,
        })
    }
}
