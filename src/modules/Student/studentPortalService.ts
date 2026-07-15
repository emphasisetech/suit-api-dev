import crypto from "crypto";
import Account from "../Account/model/Account";
import TeacherAssignment from "../Employee/model/TeacherAssignment";
import TeacherClassAttendance from "../Employee/model/TeacherClassAttendance";
import Attendance from "../Attendance/model/Attendance";
import { sendOtpEmail } from "../../utils/resendMailer";
import Student from "./model/Student";
import bcrypt from "bcryptjs";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const maskEmail = (email: string) => { const [name, domain] = email.split("@"); return name && domain ? `${name.slice(0, 2)}***@${domain}` : ""; };

class StudentPortalService {
  private async find(accountCode: string, studentKey: string, extra: any = {}) {
    const account: any = await Account.findOne({ account_code: { $regex: new RegExp(`^${escapeRegex(accountCode.trim())}$`, "i") }, status: { $ne: 0 } }).lean();
    if (!account) throw new Error("Account not found");
    return Student.findOne({
      client: { $regex: new RegExp(`^${escapeRegex(String(account.account_key))}$`, "i") },
      deleted: { $ne: true }, status: { $ne: 0 }, ...extra,
      $or: [
        { student_key: { $regex: new RegExp(`^${escapeRegex(studentKey.trim())}$`, "i") } },
        { email: { $regex: new RegExp(`^${escapeRegex(studentKey.trim())}$`, "i") } },
      ],
    }).select("+portal_otp_hash +portal_otp_expires_at +portal_access_token_hash +portal_access_token_expires_at");
  }

  async requestOtp(accountCode: string, studentKey: string) {
    const student: any = await this.find(accountCode, studentKey);
    if (!student?.email) throw new Error("Registered email is required");
    const otp = String(crypto.randomInt(100000, 1000000));
    const minutes = 10;
    student.portal_otp_hash = hash(otp); student.portal_otp_expires_at = new Date(Date.now() + minutes * 60000);
    student.portal_access_token_hash = ""; student.portal_access_token_expires_at = null;
    await student.save();
    await sendOtpEmail({ to: student.email, name: student.name, otp, subject: "Your E-Tech Suite student portal OTP", purpose: "access your student dashboard", expiresInMinutes: minutes });
    return { email: maskEmail(student.email), student_id: student.student_key, expires_in_minutes: minutes };
  }

  async verifyOtp(accountCode: string, studentKey: string, otp: string) {
    const student: any = await this.find(accountCode, studentKey, { portal_otp_hash: hash(otp), portal_otp_expires_at: { $gt: new Date() } });
    if (!student) throw new Error("OTP is invalid or expired");
    const token = crypto.randomBytes(32).toString("hex"); const hours = 12;
    student.portal_otp_hash = ""; student.portal_otp_expires_at = null;
    student.portal_access_token_hash = hash(token); student.portal_access_token_expires_at = new Date(Date.now() + hours * 3600000);
    await student.save();
    return { access_token: token, expires_in_hours: hours, student: this.publicStudent(student) };
  }

  async login(accountCode: string, username: string, password: string) {
    const account: any = await Account.findOne({ account_code: { $regex: new RegExp(`^${escapeRegex(accountCode.trim())}$`, "i") }, status: { $ne: 0 } }).lean();
    if (!account) throw new Error("Account not found");
    const student: any = await Student.findOne({ client: { $regex: new RegExp(`^${escapeRegex(String(account.account_key))}$`, "i") }, username: username.trim().toLowerCase(), deleted: { $ne: true }, status: { $ne: 0 } }).select("+password");
    if (!student?.password || !(await bcrypt.compare(password, student.password))) throw new Error("Invalid username or password");
    const token = crypto.randomBytes(32).toString("hex"); const hours = 12;
    student.portal_access_token_hash = hash(token); student.portal_access_token_expires_at = new Date(Date.now() + hours * 3600000);
    await student.save();
    return { access_token: token, expires_in_hours: hours, student: this.publicStudent(student) };
  }

  async getData(accountCode: string, studentKey: string, token: string) {
    const student: any = await this.find(accountCode, studentKey, { portal_access_token_hash: hash(token), portal_access_token_expires_at: { $gt: new Date() } });
    if (!student) throw new Error("Student session is invalid or expired");
    return this.buildData(student);
  }

  async getDataForLinkedChild(studentId: string, client: string) {
    const student: any = await Student.findOne({ _id: studentId, client, deleted: { $ne: true }, status: { $ne: 0 } });
    if (!student) throw new Error("Linked child not found");
    return this.buildData(student);
  }

  private async buildData(student: any) {
    const classes = (student.courses || []).filter((course: any) => !course.deleted).map((course: any) => course.course_name);
    if (student.class_batch) classes.push(student.class_batch);
    const uniqueClasses = [...new Set(classes.filter(Boolean))];
    const [classAttendance, attendanceSessions, assignments] = await Promise.all([
      TeacherClassAttendance.find({ student: student._id }).sort({ date: -1 }).lean(),
      Attendance.find({ studentId: student._id, client: { $regex: new RegExp(`^${escapeRegex(String(student.client || ""))}$`, "i") } }).lean(),
      TeacherAssignment.find({ client: student.client, class_name: { $in: uniqueClasses }, status: { $in: ["published", "closed"] } }).sort({ due_date: 1 }).lean(),
    ]);
    const safeAssignments = this.assignmentsForStudent(student, assignments);
    return {
      student: this.publicStudent(student),
      classes: uniqueClasses,
      attendance: classAttendance,
      attendanceSessions: this.attendanceSessions(attendanceSessions),
      assignments: safeAssignments,
      results: this.results(student, assignments),
      feeSlips: this.feeSlips(student),
    };
  }

  async submitOnlineTest(accountCode: string, studentKey: string, token: string, assignmentId: string, answers: any[]) {
    const student: any = await this.find(accountCode, studentKey, { portal_access_token_hash: hash(token), portal_access_token_expires_at: { $gt: new Date() } });
    if (!student) throw new Error("Student session is invalid or expired");
    const assignment: any = await TeacherAssignment.findOne({ _id: assignmentId, client: student.client, type: "online_test", status: "published" });
    if (!assignment) throw new Error("Online test not found");
    const classes = (student.courses || []).filter((course: any) => !course.deleted).map((course: any) => course.course_name);
    if (student.class_batch) classes.push(student.class_batch);
    if (!classes.includes(assignment.class_name)) throw new Error("This test is not assigned to your class");
    const availability = this.onlineTestAvailability(assignment, student);
    if (availability.status !== "active") throw new Error("This test is not active now");
    const existingAttempt = (assignment.attempts || []).find((attempt: any) => String(attempt.student) === String(student._id));
    if (existingAttempt) throw new Error("You have already submitted this test");

    const answerByQuestion = new Map((Array.isArray(answers) ? answers : []).map((answer: any) => [Number(answer.question_index ?? answer.questionIndex), String(answer.selected_answer ?? answer.selectedAnswer ?? "").trim()]));
    const attemptAnswers = (assignment.mcq_questions || []).map((question: any, index: number) => {
      const selected = answerByQuestion.get(index) || "";
      const isCorrect = selected && selected === question.correct_answer;
      return {
        question_index: index,
        selected_answer: selected,
        is_correct: Boolean(isCorrect),
        marks: isCorrect ? Number(question.correct_marks || 0) : Number(question.wrong_marks || 0),
      };
    });
    const marks = attemptAnswers.reduce((total: number, answer: any) => total + Number(answer.marks || 0), 0);
    const totalMarks = (assignment.mcq_questions || []).reduce((total: number, question: any) => total + Number(question.correct_marks || 0), 0);
    assignment.attempts.push({ student: student._id, answers: attemptAnswers, marks, total_marks: totalMarks, submitted_at: new Date() });
    const resultIndex = (assignment.results || []).findIndex((result: any) => String(result.student) === String(student._id));
    const result = { student: student._id, marks, remarks: "Auto evaluated online test", status: "completed" };
    if (resultIndex >= 0) assignment.results[resultIndex] = result;
    else assignment.results.push(result);
    assignment.results_published = true;
    await assignment.save();
    return { marks, total_marks: totalMarks, result_status: "published", submitted_at: new Date() };
  }

  private publicStudent(student: any) {
    return { _id: student._id, student_key: student.student_key, name: student.name, email: maskEmail(student.email || ""), phone_number: student.phone_number, fathers_name: student.fathers_name, mothers_name: student.mothers_name, dob: student.dob, class_batch: student.class_batch, courses: student.courses || [], total_pending_fee: student.total_pending_fee || 0 };
  }

  private feeSlips(student: any) {
    return (student.courses || [])
      .filter((course: any) => course?.deleted !== true)
      .flatMap((course: any) =>
        (course.payments || [])
          .filter((payment: any) => payment?.deleted !== true)
          .map((payment: any) => ({
            _id: payment._id,
            student_id: student._id,
            course_id: course._id,
            course_name: course.course_name,
            slip_number: payment.slip_number,
            payment_amount: payment.payment_amount,
            payment_date: payment.payment_date,
            payment_mode: payment.payment_mode,
            payment_status: payment.payment_status,
            remarks: payment.remarks,
            createdAt: payment.createdAt,
          })),
      )
      .sort((a: any, b: any) => new Date(b.payment_date || b.createdAt || 0).getTime() - new Date(a.payment_date || a.createdAt || 0).getTime());
  }

  private attendanceSessions(records: any[]) {
    return (records || [])
      .flatMap((record: any) =>
        (record.attendacelist || []).map((session: any) => ({
          _id: `${record._id}-${session.checkInTime || ""}`,
          checkInTime: session.checkInTime,
          checkOutTime: session.checkOutTime,
          date: session.checkInTime || record.createdAt,
        })),
      )
      .sort((a: any, b: any) => new Date(b.checkInTime || b.date || 0).getTime() - new Date(a.checkInTime || a.date || 0).getTime());
  }

  private assignmentsForStudent(student: any, assignments: any[]) {
    return (assignments || []).map((assignment: any) => {
      const value: any = { ...assignment };
      if (value.type === "homework") value.type = "assignment";
      if (value.type === "online_test") {
        const availability = this.onlineTestAvailability(value, student);
        const attempt = (value.attempts || []).find((record: any) => String(record.student) === String(student._id));
        const attemptAnswerByQuestion :any= new Map((attempt?.answers || []).map((answer: any) => [Number(answer.question_index), answer]));
        value.availability_status = availability.status;
        value.availability_label = availability.label;
        value.has_attempt = availability.hasAttempt;
        value.mcq_questions = availability.status === "active" || attempt
          ? this.shuffle((value.mcq_questions || []).map((question: any, index: number) => ({
            question_index: index,
            question: question.question,
            options: this.shuffle([question.correct_answer, ...(question.wrong_answers || [])].filter(Boolean)),
            correct_marks: question.correct_marks,
            wrong_marks: question.wrong_marks,
            ...(attempt ? {
              correct_answer: question.correct_answer,
              selected_answer: attemptAnswerByQuestion.get(index)?.selected_answer || "",
              is_correct: Boolean(attemptAnswerByQuestion.get(index)?.is_correct),
              earned_marks: attemptAnswerByQuestion.get(index)?.marks ?? 0,
            } : {}),
          })))
          : [];
        delete value.attempts;
      }
      return value;
    });
  }

  private onlineTestAvailability(assignment: any, student: any) {
    const now = Date.now();
    const start = assignment.start_at ? new Date(assignment.start_at).getTime() : 0;
    const end = assignment.end_at ? new Date(assignment.end_at).getTime() : assignment.due_date ? new Date(assignment.due_date).getTime() : 0;
    const hasAttempt = (assignment.attempts || []).some((attempt: any) => String(attempt.student) === String(student._id));
    if (hasAttempt) return { status: "submitted", label: "Submitted", hasAttempt };
    if (assignment.status !== "published") return { status: assignment.status === "closed" ? "closed" : "draft", label: assignment.status === "closed" ? "Closed" : "Not Published", hasAttempt };
    if (start && now < start) return { status: "upcoming", label: `Upcoming ${new Date(start).toLocaleString()}`, hasAttempt };
    if (end && now > end) return { status: "closed", label: "Closed", hasAttempt };
    return { status: "active", label: "Active Now", hasAttempt };
  }

  private shuffle(values: any[]) {
    return [...values].sort(() => crypto.randomInt(0, 3) - 1);
  }

  private results(student: any, assignments: any[]) {
    return (assignments || [])
      .filter((assignment: any) => ["homework", "assignment", "offline_test", "online_test"].includes(assignment.type))
      .map((assignment: any) => {
        const result = (assignment.results || []).find((record: any) => String(record.student) === String(student._id));
        const attempt = (assignment.attempts || []).find((record: any) => String(record.student) === String(student._id));
        const hasPublishedResult = Boolean(
          (assignment.results_published && result && result.status === "completed" && result.marks !== undefined && result.marks !== null) ||
          (attempt && attempt.marks !== undefined && attempt.marks !== null),
        );
        const isPending = !hasPublishedResult && assignment.status === "closed";
        return {
          _id: assignment._id,
          test_id: assignment._id,
          title: assignment.title,
          class_name: assignment.class_name,
          subject: assignment.subject,
          due_date: assignment.due_date,
          status: assignment.status,
          total_marks: assignment.total_marks || 0,
          results_published: Boolean(assignment.results_published),
          result_status: hasPublishedResult ? "published" : isPending ? "pending" : "not_published",
          marks: hasPublishedResult ? result?.marks ?? attempt?.marks : null,
          remarks: hasPublishedResult ? result?.remarks || "" : "",
        };
      });
  }
}
export default new StudentPortalService();
