import mongoose, { Schema, Document } from "mongoose";

export interface IEmployeeAttendance extends Document {
  employeeId: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  client: string; // Account association
  status: 'Present' | 'Absent' | 'Half Day' | 'Paid Leave' | 'Unpaid Leave';
  workHours?: number;
  checkIn?: string;
  checkOut?: string;
  otHours?: number;
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EmployeeAttendanceSchema: Schema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    date: { type: String, required: true, trim: true },
    client: { type: String, required: true, trim: true },
    status: { 
        type: String, 
        enum: ['Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave'],
        default: 'Present' 
    },
    workHours: { type: Number, default: 0 },
    checkIn: { type: String, trim: true },
    checkOut: { type: String, trim: true },
    otHours: { type: Number, default: 0, min: 0 },
    reason: { type: String, trim: true },
  },
  { timestamps: true }
);

// Index for quick lookups by client and date
EmployeeAttendanceSchema.index({ client: 1, date: 1 });
EmployeeAttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true, sparse: true });
EmployeeAttendanceSchema.index({ teacherId: 1, date: 1 }, { sparse: true });

export default mongoose.model<IEmployeeAttendance>("EmployeeAttendance", EmployeeAttendanceSchema, "employeesattendances");
