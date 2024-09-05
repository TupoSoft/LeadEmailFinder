import mongoose from 'mongoose'

export async function connect(): Promise<void> {
    try {
        await mongoose.connect('mongodb://root:example@mongo/verifier')
        console.log('MongoDB connected')
    } catch (error) {
        console.error('MongoDB connection error:', error)
        process.exit(1)
    }
}
