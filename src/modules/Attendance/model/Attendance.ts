import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceElement {
    userId: mongoose.Types.ObjectId;
    checkInTime?: Date;
    checkOutTime?: Date;
}

export interface IAttendance extends Document {
    client: string;
    studentId: mongoose.Types.ObjectId;
    attendacelist: IAttendanceElement[];
}

const AttendanceElementSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    checkInTime: { type: Date },
    checkOutTime: { type: Date }
}, { _id: false });

const AttendanceSchema: Schema = new Schema({
    client: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    attendacelist: { type: [AttendanceElementSchema], default: [] }
}, { timestamps: true });

// Compound indexes as requested
AttendanceSchema.index({ studentId: 1, client: 1 });

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
