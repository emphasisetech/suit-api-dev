import mongoose, { Schema } from "mongoose";

const TeacherClassAttendanceSchema = new Schema({
  client: { type: String, required: true, trim: true, index: true },
  teacher: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  class_name: { type: String, required: true, trim: true },
  date: { type: String, required: true, trim: true },
  status: { type: String, enum: ["Present", "Absent", "Late", "Leave"], required: true },
}, { timestamps: true });

TeacherClassAttendanceSchema.index({ teacher: 1, student: 1, class_name: 1, date: 1 }, { unique: true });

export default mongoose.model("TeacherClassAttendance", TeacherClassAttendanceSchema, "teacher_class_attendance");
