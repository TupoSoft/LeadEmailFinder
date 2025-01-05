import type { UserRepository } from './repository'
import type { User } from './entity'
import type { CreateUserDto } from './dto'

export interface IUserService {
    createUser: (user: CreateUserDto) => Promise<User>
}

export class UserService implements IUserService {
    constructor(private readonly userRepository: UserRepository) {}

    async createUser(createUserDto: CreateUserDto): Promise<User> {
        return await this.userRepository.create(createUserDto)
    }
}
