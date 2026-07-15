import { Request, Response } from "express";
import { StudentService } from "./studentService";
import { responseService } from "../../utils/response.util";
import { MESSAGES } from "../../constants/messages";
import studentPortalService from "./studentPortalService";
import {
  sendEmailVerificationPage,
  wantsHtmlResponse,
} from "../../utils/emailVerificationResponse";

const studentService = new StudentService();

export const requestStudentPortalOtp = async (req: Request, res: Response) => {
  try { return responseService.successResponse(await studentPortalService.requestOtp(String(req.body.account_code || ""), String(req.body.student_id || req.body.email || "")), "OTP sent", res); }
  catch (error: any) { return responseService.errorResponse(error, res); }
};
export const verifyStudentPortalOtp = async (req: Request, res: Response) => {
  try { return responseService.successResponse(await studentPortalService.verifyOtp(String(req.body.account_code || ""), String(req.body.student_id || req.body.email || ""), String(req.body.otp || "")), "OTP verified", res); }
  catch (error: any) { return responseService.errorResponse(error, res); }
};
export const loginStudentPortal = async (req: Request, res: Response) => {
  try { return responseService.successResponse(await studentPortalService.login(String(req.body.account_code || ""), String(req.body.username || ""), String(req.body.password || "")), "Login successful", res); }
  catch (error: any) { return responseService.errorResponse(error, res); }
};
export const getStudentPortalData = async (req: Request, res: Response) => {
  try { return responseService.successResponse(await studentPortalService.getData(String(req.query.account_code || ""), String(req.query.student_id || ""), String(req.query.access_token || "")), "Student portal data retrieved", res); }
  catch (error: any) { return responseService.errorResponse(error, res); }
};
export const submitStudentOnlineTest = async (req: Request, res: Response) => {
  try { return responseService.successResponse(await studentPortalService.submitOnlineTest(String(req.body.account_code || ""), String(req.body.student_id || ""), String(req.body.access_token || ""), String(req.params.assignmentId || ""), req.body.answers || []), "Online test submitted", res); }
  catch (error: any) { return responseService.errorResponse(error, res); }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const result = await studentService.create(req.body);
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.CREATED,
      res,
      201,
    );
  } catch (error: any) {
    console.log(error);
    if (
      error.message === "STUDENTS.DUPLICATE_STUDENT_CODE" ||
      error.code === 11000
    ) {
      return responseService.ConflictResponse(
        MESSAGES.STUDENTS.DUPLICATE_STUDENT_CODE,
        res,
      );
    }
    return responseService.errorResponse(error, res);
  }
};

export const getStudents = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.findAll(req.query, payload);
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.RETRIEVED,
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.findById(req.params.id as string, payload);
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.RETRIEVED,
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.update(
      req.params.id as string,
      req.body,
      payload
    );
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.UPDATED,
      res,
    );
  } catch (error: any) {
    if (
      error.message === "STUDENTS.DUPLICATE_STUDENT_CODE" ||
      error.code === 11000
    ) {
      return responseService.ConflictResponse(
        MESSAGES.STUDENTS.DUPLICATE_STUDENT_CODE,
        res,
      );
    }
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

export const uploadStudentImage = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.uploadStudentImage(
      req.params.id as string,
      req.body,
      payload
    );
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.UPDATED,
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    if (
      error.message === "STUDENT_IMAGE_REQUIRED" ||
      error.message === "STUDENT_IMAGE_INVALID_TYPE" ||
      error.message === "CLOUDINARY_NOT_CONFIGURED"
    ) {
      return responseService.InvalidDataResponse(error.message, res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const sendEmailVerification = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.sendEmailVerification(
      req.params.id as string,
      payload
    );
    return responseService.successResponse(
      result,
      "Verification email sent",
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    if (error.message === "EMAIL_REQUIRED")
      return responseService.InvalidDataResponse("Student email is required", res);
    return responseService.errorResponse(error, res);
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      if (wantsHtmlResponse(req)) {
        return sendEmailVerificationPage(
          res,
          400,
          "Verification link is missing",
          "Please request a new verification email and try again.",
        );
      }
      return responseService.InvalidDataResponse("Verification token is required", res);
    }

    const result = await studentService.verifyEmail(token);
    if (wantsHtmlResponse(req)) {
      return sendEmailVerificationPage(
        res,
        200,
        "Email verified",
        "Your student email address has been verified successfully.",
      );
    }
    return responseService.successResponse(
      result,
      "Email verified successfully",
      res,
    );
  } catch (error: any) {
    if (error.message === "EMAIL_VERIFICATION_INVALID_OR_EXPIRED") {
      if (wantsHtmlResponse(req)) {
        return sendEmailVerificationPage(
          res,
          400,
          "Verification link expired",
          "This verification link is invalid or expired. Please request a new verification email.",
        );
      }
      return responseService.InvalidDataResponse(
        "Verification link is invalid or expired",
        res,
      );
    }
    return responseService.errorResponse(error, res);
  }
};

export const requestResultOtp = async (req: Request, res: Response) => {
  try {
    const accountCode = String(req.body.account_code || req.body.accountCode || "").trim();
    const studentKey = String(req.body.student_key || req.body.studentId || "").trim();
    if (!accountCode) {
      return responseService.InvalidDataResponse("Account code is required", res);
    }
    if (!studentKey) {
      return responseService.InvalidDataResponse("Student ID is required", res);
    }

    const result = await studentService.requestResultOtp(accountCode, studentKey);
    return responseService.successResponse(
      result,
      "OTP sent to registered email",
      res,
    );
  } catch (error: any) {
    if (error.message === "ACCOUNTS.NOT_FOUND") {
      return responseService.notFoundResponse("Account code not found", res);
    }
    if (error.message === "STUDENTS.NOT_FOUND") {
      return responseService.notFoundResponse("Student ID not found", res);
    }
    if (error.message === "EMAIL_REQUIRED") {
      return responseService.InvalidDataResponse(
        "No email is registered for this student",
        res,
      );
    }
    return responseService.errorResponse(error, res);
  }
};

export const verifyResultOtp = async (req: Request, res: Response) => {
  try {
    const accountCode = String(req.body.account_code || req.body.accountCode || "").trim();
    const studentKey = String(req.body.student_key || req.body.studentId || "").trim();
    const otp = String(req.body.otp || "").trim();
    if (!accountCode || !studentKey || !otp) {
      return responseService.InvalidDataResponse("Account code, Student ID and OTP are required", res);
    }

    const result = await studentService.verifyResultOtp(accountCode, studentKey, otp);
    return responseService.successResponse(
      result,
      "OTP verified successfully",
      res,
    );
  } catch (error: any) {
    if (error.message === "ACCOUNTS.NOT_FOUND") {
      return responseService.notFoundResponse("Account code not found", res);
    }
    if (error.message === "RESULT_OTP_INVALID_OR_EXPIRED") {
      return responseService.InvalidDataResponse("OTP is invalid or expired", res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const changeStatus = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.changeStatus(req.params.id as string, payload);
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.STATUS_CHANGED,
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

export const importDealersInDatabase = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.importBulk(req.body, payload);
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.FILE_IMPORTED,
      res,
    );
  } catch (error: any) {
    if (error.code === 11000)
      return responseService.ConflictResponse(
        MESSAGES.STUDENTS.DUPLICATE_STUDENT_CODE,
        res,
      );
    return responseService.errorResponse(error, res);
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    await studentService.delete(req.params.id as string, payload);
    return responseService.successResponse(
      null,
      MESSAGES.STUDENTS.DELETED,
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.STUDENTS.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

export const updatePendingFeesByClient = async (
  req: Request,
  res: Response,
) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.updatePendingFeesByClient(
      req.params.client as string,
      payload
    );
    return responseService.successResponse(
      result,
      MESSAGES.STUDENTS.PENDDING_FEE_UPDATED,
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const calculatePendingFee = async (req: Request, res: Response) => {
  try {
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.calculatePendingFee(
      req.params.id as string,
      payload
    );
    return responseService.successResponse(
      result,
      "PENDING_FEE_CALCULATED",
      res,
    );
  } catch (error: any) {
    if (error.message === "STUDENTS.NOT_FOUND")
      return responseService.notFoundResponse("Student not found", res);
    return responseService.errorResponse(error, res);
  }
};

// Payment Controller Methods
export const addPayment = async (req: Request, res: Response) => {
  try {
    const { student_id, course_id, ...paymentDto } = req.body;
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.addPayment(
      student_id,
      course_id,
      paymentDto,
      payload
    );
    return responseService.successResponse(
      result,
      MESSAGES.PAYMENTS.CREATED,
      res,
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.DOES_NOT_EXISTS")
      return responseService.ForbiddenResponse(
        MESSAGES.PAYMENTS.DOES_NOT_EXISTS,
        res,
      );
    return responseService.errorResponse(error, res);
  }
};

export const updatePayment = async (req: Request, res: Response) => {
  try {
    const { student_id, course_id, ...paymentUpdateDto } = req.body;
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    const result = await studentService.updatePayment(
      req.params.paymentId as string,
      student_id,
      course_id,
      paymentUpdateDto,
      payload
    );
    return responseService.successResponse(
      result,
      MESSAGES.PAYMENTS.UPDATED,
      res,
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.DOES_NOT_EXIST")
      return responseService.ForbiddenResponse(
        MESSAGES.PAYMENTS.DOES_NOT_EXISTS,
        res,
      );
    return responseService.errorResponse(error, res);
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  try {
    const { student_id, course_id } = req.body;
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    await studentService.deletePayment(
      req.params.paymentId as string,
      student_id,
      course_id,
      payload,
    );
    return responseService.successResponse(
      null,
      MESSAGES.PAYMENTS.DELETED,
      res,
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.PAYMENTS.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

// Course Controller Methods
export const createCourse = async (req: Request, res: Response) => {
  try {
    const { student_id, ...courseDto } = req.body;
    const result = await studentService.createCourse(student_id, courseDto);
    return responseService.successResponse(
      result,
      MESSAGES.COURSE.CREATED,
      res,
    );
  } catch (error: any) {
    if (error.message === "COURSE.DOES_NOT_EXISTS")
      return responseService.ForbiddenResponse(
        MESSAGES.COURSE.DOES_NOT_EXISTS,
        res,
      );
    return responseService.errorResponse(error, res);
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const { student_id, ...courseData } = req.body;
    // console.log("courseData>>>", courseData);

    const result = await studentService.updateCourse(
      req.params.courseId as string,
      student_id,
      courseData,
    );
    return responseService.successResponse(
      result,
      MESSAGES.COURSE.UPDATED,
      res,
    );
  } catch (error: any) {
    if (
      error.message === "COURSE.DOES_NOT_EXISTS" ||
      error.message === "COURSE.UPDATE_FAILED"
    ) {
      return responseService.ForbiddenResponse(error.message, res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const { student_id } = req.body;
    const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
    await studentService.deleteCourse(
      req.params.courseId as string,
      student_id,
      payload,
    );
    return responseService.successResponse(null, MESSAGES.COURSE.DELETED, res);
  } catch (error: any) {
    if (error.message === "COURSE.NOT_FOUND")
      return responseService.notFoundResponse(MESSAGES.COURSE.NOT_FOUND, res);
    return responseService.errorResponse(error, res);
  }
};

export const updateCourseStatus = async (req: Request, res: Response) => {
  try {
    const { student_id, status } = req.body;
    
    const result = await studentService.updateCourseStatus(
      req.params.courseId as string,
      student_id,
      status,
    );
    
    return responseService.successResponse(
      result,
      status === 1 ? MESSAGES.COURSE.ACTIVE : MESSAGES.COURSE.INACTIVE,
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const result = await studentService.findAllPayments(req.query);
    return responseService.successResponse(
      result,
      "PAYMENTS_RETRIEVED",
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getPaymentReceipt = async (req: Request, res: Response) => {
  try {
    const result = await studentService.getPaymentReceipt(req.params.paymentId as string);
    return responseService.successResponse(
      result,
      "PAYMENT_RECEIPT_RETRIEVED",
      res,
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.NOT_FOUND") {
      return responseService.notFoundResponse("Payment not found", res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const getCertificate = async (req: Request, res: Response) => {
  try {
    const result = await studentService.getCertificate(req.params.studentId as string, req.params.courseId as string);
    return responseService.successResponse(
      result,
      "CERTIFICATE_DATA_RETRIEVED",
      res,
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.NOT_FOUND" || error.message === "STUDENT_OR_COURSE_NOT_FOUND") {
      return responseService.notFoundResponse("Certificate not found", res);
    }
    return responseService.errorResponse(error, res);
  }
};
