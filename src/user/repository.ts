import type { CreateUserDto, UpdateUserDto } from './dto'
import type { User } from './entity'

export interface UserRepository {
    findAll: () => Promise<User[]>

    findById: (id: string) => Promise<User>

    findByEmail: (email: string) => Promise<User>

    update: (id: string, user: UpdateUserDto) => Promise<User>

    create: (user: CreateUserDto) => Promise<User>

    delete: (id: string) => Promise<void>
}
