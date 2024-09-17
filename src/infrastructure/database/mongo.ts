import { readFile } from 'fs/promises'
import mongoose from 'mongoose'

export async function mongoConnect(): Promise<void> {
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
