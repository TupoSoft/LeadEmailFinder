import { ZERO } from '../common'

export function appendRandomPrefix(str: string): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length)
        result += characters[randomIndex]
    }
    return result + str
}

export function isEmptyString(str: string): boolean {
    return str.length === ZERO
}
