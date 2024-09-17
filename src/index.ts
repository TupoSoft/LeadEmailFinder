import express from 'express'
import { mongoConnect } from './infrastructure/database/mongo'
import routes from './interfaces/routes/routes'

const { PORT } = process.env

const port = PORT ?? 3000

async function main(): Promise<void> {
    await mongoConnect()
    express().disable('x-powered-by').use(routes).listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

void main()
