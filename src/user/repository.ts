import type { CreateUserDto, UpdateUserDto } from './dto'
import type { User } from './entity'

export interface UserRepository {
    findAll: () => Promise<User[]>

    findById: (id: string) => Promise<User | null>

    findByEmail: (email: string) => Promise<User | null>

    update: (id: string, user: UpdateUserDto) => Promise<User | null>

    create: (user: CreateUserDto) => Promise<User>

    delete: (id: string) => Promise<boolean>
}
