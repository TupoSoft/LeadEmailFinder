import type { UserRepository } from './repository'
import type { User } from './entity'
import type { CreateUserDto } from './dto'

export interface IUserService {
    getByEmail: (id: string) => Promise<User>
    create: (user: CreateUserDto) => Promise<User>
}

export class UserService implements IUserService {
    constructor(private readonly userRepository: UserRepository) {}

    async getByEmail(id: string): Promise<User> {
        return await this.userRepository.findByEmail(id)
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        return await this.userRepository.create(createUserDto)
    }
}
