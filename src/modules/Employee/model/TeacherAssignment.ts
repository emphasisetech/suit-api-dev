import mongoose, { Schema } from "mongoose";

const TeacherAssignmentSchema = new Schema({
  client: { type: String, required: true, trim: true, index: true },
  teacher: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  type: { type: String, enum: ["homework", "assignment", "offline_test", "online_test"], required: true },
  class_name: { type: String, required: true, trim: true },
  subject: { type: String, trim: true, default: "" },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: "" },
  due_date: { type: String, required: true, trim: true },
  start_at: { type: String, trim: true, default: "" },
  end_at: { type: String, trim: true, default: "" },
  questions: { type: [String], default: [] },
  mcq_questions: {
    type: [{
      question: { type: String, trim: true, default: "" },
      correct_answer: { type: String, trim: true, default: "" },
      wrong_answers: { type: [String], default: [] },
      correct_marks: { type: Number, default: 1 },
      wrong_marks: { type: Number, default: 0 },
    }],
    default: [],
  },
  total_marks: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "published", "closed"], default: "published" },
  results_published: { type: Boolean, default: false },
  attempts: {
    type: [{
      student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
      answers: {
        type: [{
          question_index: { type: Number, required: true },
          selected_answer: { type: String, trim: true, default: "" },
          is_correct: { type: Boolean, default: false },
          marks: { type: Number, default: 0 },
        }],
        default: [],
      },
      marks: { type: Number, default: 0 },
      total_marks: { type: Number, default: 0 },
      submitted_at: { type: Date, default: Date.now },
    }],
    default: [],
  },
  results: {
    type: [{
      student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
      marks: { type: Number, default: null },
      remarks: { type: String, trim: true, default: "" },
      status: { type: String, enum: ["pending", "completed"], default: "pending" },
    }],
    default: [],
  },
}, { timestamps: true });

export default mongoose.model("TeacherAssignment", TeacherAssignmentSchema, "teacher_assignments");
