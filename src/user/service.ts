import type { UserRepository } from './repository'
import type { User } from './entity'
import type { CreateUserDto } from './dto'

export class UserService {
    constructor(private readonly userRepository: UserRepository) {}

    async createUser(createUserDto: CreateUserDto): Promise<User> {
        return await this.userRepository.create(createUserDto)
    }
}
