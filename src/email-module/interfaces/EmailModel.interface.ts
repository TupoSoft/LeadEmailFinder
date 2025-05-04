import { Model, SaveOptions } from 'mongoose'
import { Email } from '../email.schema'

export interface IEmailModel extends Pick<Model<Email>, 'exists' | 'find' | 'findById' | 'findOneAndUpdate'> {
    insertOne(doc: Email, options?: SaveOptions): Promise<Email>
}
