import express from 'express'
import { mongooseConnect } from './infrastructure/database/mongoose'
import routes from './interfaces/routes/routes'
import axios from 'axios'

axios.defaults.proxy = {
    host: 'zproxy.lum-superproxy.io',
    port: 22225,
    auth: {
        username: 'lum-customer-c_7ac16cb1-zone-salesar_simple_links',
        password: '28gpq8rxnx1m',
    },
    protocol: 'http',
}

const { PORT } = process.env

const port = PORT ?? 3000

async function main(): Promise<void> {
    await mongooseConnect()
    express()
        .disable('x-powered-by')
        .use(routes)
        .listen(port, () => {
            console.log(`Server is running on port ${port}`)
        })
}

void main()
