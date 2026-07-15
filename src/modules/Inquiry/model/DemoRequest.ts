import mongoose, { Schema, Document } from 'mongoose';
import { allowedEmailValidator } from '../../../utils/emailValidation';

export enum DemoRequestStatus {
  PENDING = 'pending',
  DONE = 'done',
  ADOPTED = 'adopted',
  REJECTED = 'rejected',
  ON_HOLD = 'on hold'
}

export interface IDemoRequest extends Document {
  name: string;
  phone: string;
  email: string;
  address?: string;
  enterprise_name?: string;
  status: DemoRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DemoRequestSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, validate: allowedEmailValidator },
  address: { type: String, trim: true },
  enterprise_name: { type: String, trim: true },
  status: { 
    type: String, 
    enum: Object.values(DemoRequestStatus), 
    default: DemoRequestStatus.PENDING 
  }
}, { timestamps: true });

export default mongoose.model<IDemoRequest>('DemoRequest', DemoRequestSchema);
