export interface CreateUserDto {
    email: string
    password: string
}

export type UpdateUserDto = Partial<CreateUserDto>
