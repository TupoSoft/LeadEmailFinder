export interface AuthData {
    email: string
    password: string
}

export interface RefreshData {
    token: string
}

export interface LoginResult {
    token: string
}
