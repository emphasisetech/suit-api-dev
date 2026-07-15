import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentSequence extends Document {
  scope: string;
  type: string;
  client: string;
  prefix: string;
  lastSequence: number;
}

const PaymentSequenceSchema: Schema = new Schema(
  {
    scope: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, trim: true },
    client: { type: String, required: true, trim: true },
    prefix: { type: String, required: true, trim: true },
    lastSequence: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model<IPaymentSequence>(
  "PaymentSequence",
  PaymentSequenceSchema,
);
