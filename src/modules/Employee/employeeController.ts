import { Request, Response } from "express";
import employeeService from "./employeeService";
import { responseService } from "../../utils/response.util";

export const createEmployee = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.createEmployee(req.body, (req as any).user || {});
        return responseService.successResponse(result, "Employee created successfully", res, 201);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const getEmployees = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.getEmployees(req.query as Record<string, any>);
        return responseService.successResponse(result, "Employees retrieved successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const updateEmployee = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.updateEmployee(req.params.id as string, req.body, (req as any).user || {});
        return responseService.successResponse(result, "Employee updated successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const deleteEmployee = async (req: Request, res: Response) => {
    try {
        await employeeService.deleteEmployee(req.params.id as string, (req as any).user || {});
        return responseService.successResponse(null, "Employee deleted successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const markAttendance = async (req: Request, res: Response) => {
    try {
        const result = Array.isArray(req.body?.records)
            ? await employeeService.markBulkAttendance(req.body.records)
            : await employeeService.markAttendance(req.body);
        return responseService.successResponse(result, "Attendance marked successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const getSalaryReport = async (req: Request, res: Response) => {
    try {
        const client = req.query.client as string;
        const month = req.query.month as string;
        const year = req.query.year as string;
        const result = await employeeService.getSalaryReport(client, month, year);
        return responseService.successResponse(result, "Salary report generated successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};
export const getAttendance = async (req: Request, res: Response) => {
    try {
        const client = req.query.client as string;
        const date = req.query.date as string;
        const result = await employeeService.getEmployeeAttendance(client, date);
        return responseService.successResponse(result, "Attendance retrieved successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const removeAttendanceCheckout = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.removeAttendanceCheckout(
            req.params.employeeId as string,
            String(req.body.date || ""),
            String(req.body.client || ""),
        );
        return responseService.successResponse(result, "Employee checkout removed successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const requestPortalOtp = async (req: Request, res: Response) => {
    try {
        const accountCode = String(req.body.account_code || req.body.accountCode || "").trim();
        const employeeId = String(req.body.employee_id || req.body.employeeId || "").trim();
        if (!accountCode) {
            return responseService.errorResponse(new Error("Account code is required"), res);
        }
        if (!employeeId) {
            return responseService.errorResponse(new Error("Employee ID is required"), res);
        }

        const staffPortal = req.body.staff_portal === true || req.body.staffPortal === true;
        const result = await employeeService.requestPortalOtp(accountCode, employeeId, staffPortal);
        return responseService.successResponse(result, "OTP sent to registered employee email", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const verifyPortalOtp = async (req: Request, res: Response) => {
    try {
        const accountCode = String(req.body.account_code || req.body.accountCode || "").trim();
        const employeeId = String(req.body.employee_id || req.body.employeeId || "").trim();
        const otp = String(req.body.otp || "").trim();
        if (!accountCode || !employeeId || !otp) {
            return responseService.errorResponse(new Error("Account code, employee ID and OTP are required"), res);
        }

        const staffPortal = req.body.staff_portal === true || req.body.staffPortal === true;
        const result = await employeeService.verifyPortalOtp(accountCode, employeeId, otp, staffPortal);
        return responseService.successResponse(result, "OTP verified successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const loginStaffPortal = async (req: Request, res: Response) => {
    try {
        const accountCode = String(req.body.account_code || req.body.accountCode || "").trim();
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");
        if (!accountCode || !username || !password) {
            return responseService.errorResponse(new Error("Account code, username and password are required"), res);
        }
        const result = await employeeService.loginStaffPortal(accountCode, username, password);
        return responseService.successResponse(result, "Login successful", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const getTeacherClassroom = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.getTeacherClassroom(
            String(req.query.account_code || ""), String(req.query.employee_id || ""),
            String(req.query.access_token || ""), String(req.query.date || ""),
        );
        return responseService.successResponse(result, "Teacher classroom retrieved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const getAccountantWorkspace = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.getAccountantWorkspace(
            String(req.query.account_code || ""), String(req.query.employee_id || ""), String(req.query.access_token || ""),
            String(req.query.month || ""), String(req.query.year || ""), String(req.query.date || ""),
        );
        return responseService.successResponse(result, "Accountant workspace retrieved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const addAccountantStudentPayment = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.addAccountantStudentPayment(
            String(req.body.account_code || ""), String(req.body.employee_id || ""), String(req.body.access_token || ""), req.body,
        );
        return responseService.successResponse(result, "Student payment added", res, 201);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const markAccountantStaffAttendance = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.markAccountantStaffAttendance(
            String(req.body.account_code || ""), String(req.body.employee_id || ""), String(req.body.access_token || ""), req.body,
        );
        return responseService.successResponse(result, "Staff attendance saved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const getPortalChatContacts = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.getPortalChatContacts(String(req.query.account_code || ""), String(req.query.user_id || ""), String(req.query.access_token || ""), String(req.query.role || ""));
        return responseService.successResponse(result, "Chat contacts retrieved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const getPortalChatMessages = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.getPortalChatMessages(String(req.query.account_code || ""), String(req.query.user_id || ""), String(req.query.access_token || ""), String(req.query.role || ""), String(req.query.contact_id || ""));
        return responseService.successResponse(result, "Chat messages retrieved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const sendPortalChatMessage = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.sendPortalChatMessage(String(req.body.account_code || ""), String(req.body.user_id || ""), String(req.body.access_token || ""), String(req.body.role || ""), String(req.body.contact_id || ""), String(req.body.message || ""));
        return responseService.successResponse(result, "Message sent", res, 201);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const markTeacherClassAttendance = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.markTeacherClassAttendance(
            String(req.body.account_code || ""), String(req.body.employee_id || ""),
            String(req.body.access_token || ""), req.body,
        );
        return responseService.successResponse(result, "Class attendance saved", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const createTeacherAssignment = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.createTeacherAssignment(
            String(req.body.account_code || ""), String(req.body.employee_id || ""),
            String(req.body.access_token || ""), req.body,
        );
        return responseService.successResponse(result, "Assignment created", res, 201);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const updateTeacherAssignment = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.updateTeacherAssignment(
            String(req.body.account_code || ""), String(req.body.employee_id || ""),
            String(req.body.access_token || ""), String(req.params.assignmentId || ""), req.body,
        );
        return responseService.successResponse(result, "Assignment updated", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const updateTeacherAssignmentResults = async (req: Request, res: Response) => {
    try {
        const result = await employeeService.updateTeacherAssignmentResults(
            String(req.body.account_code || ""), String(req.body.employee_id || ""),
            String(req.body.access_token || ""), String(req.params.assignmentId || ""), req.body,
        );
        return responseService.successResponse(result, "Assignment results updated", res);
    } catch (error: any) { return responseService.errorResponse(error, res); }
};

export const getPortalData = async (req: Request, res: Response) => {
    try {
        const accountCode = String(req.query.account_code || req.query.accountCode || "").trim();
        const employeeId = String(req.query.employee_id || req.query.employeeId || "").trim();
        const accessToken = String(req.query.access_token || req.query.accessToken || "").trim();
        const month = String(req.query.month || "").trim();
        const year = String(req.query.year || "").trim();
        const staffPortal = String(req.query.staff_portal || req.query.staffPortal || "") === "true";
        if (!accountCode || !employeeId || !accessToken || !month || !year) {
            return responseService.errorResponse(new Error("Account code, employee ID, access token, month and year are required"), res);
        }

        const result = await employeeService.getPortalData(accountCode, employeeId, accessToken, month, year, staffPortal);
        return responseService.successResponse(result, "Employee portal data retrieved successfully", res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};
