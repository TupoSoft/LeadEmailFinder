import { NotFoundException } from '@nestjs/common'

export class ProxyNotFoundException extends NotFoundException {
    constructor(id: string) {
        super(`Proxy with id "${id}" not found.`)
    }
}
