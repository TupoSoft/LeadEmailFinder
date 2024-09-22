import { readFile } from 'fs/promises'
import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'

export async function mongooseConnect(): Promise<void> {
    try {
        const { MONGO_URL_FILE: mongoUrlFile } = process.env

        if (mongoUrlFile === undefined) {
            console.error(`The MONGO_URL_FILE variable is undefined.`)
            process.exit(1)
        }

        const mongoUrl = await readFile(mongoUrlFile, 'utf-8')
        await mongoose.connect(mongoUrl)
        console.log('MongoDB connected')
    } catch (error) {
        console.error('MongoDB connection error:', error)
        process.exit(1)
    }
}

export async function generateObjectIdAsync(): Promise<mongoose.Types.ObjectId> {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
        randomBytes(12, (err, buf) => {
            if (err !== null) reject(err)
            else resolve(buf)
        })
    })

    console.log(buffer.toString('hex'))
    return new mongoose.Types.ObjectId(buffer.toString('hex'))
}
