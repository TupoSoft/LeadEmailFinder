import mongoose from 'mongoose'

export async function mongoConnect(): Promise<void> {
    try {
        await mongoose.connect('mongodb://verifier:verifier@mongo:27017/verifier')
        console.log('MongoDB connected')
    } catch (error) {
        console.error('MongoDB connection error:', error)
        process.exit(1)
    }
}
