import { Request, Response } from 'express';
import { AttendanceService } from './attendanceService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';

const attendanceService = new AttendanceService();

export const create = async (req: Request, res: Response) => {
    try {
        const result = await attendanceService.create(req.body);
        return responseService.successResponse(result, MESSAGES.ATTENDANCE.CREATED, res, 201);
    } catch (error: any) {
        console.error("Error creating Attendance:", error);
        if (error.code === 11000) {
            return responseService.ConflictResponse(MESSAGES.ATTENDANCE.DUPLICATE, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const query: any = req.query;
        // Merge body userId if present (as per original logic logic)
        if (req.body.userId) query.userId = req.body.userId;

        const result = await attendanceService.findAll(query);
        return responseService.successResponse(result, MESSAGES.ATTENDANCE.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const findStudentAttendance = async (req: Request, res: Response) => {
    try {
        const result = await attendanceService.findStudentAttendance(
            req.params.studentId as string,
            req.query.client as string
        );
        return responseService.successResponse(result, MESSAGES.ATTENDANCE.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const getStudentsForCheckInCheckOut = async (req: Request, res: Response) => {
    try {
        const result = await attendanceService.getStudentsForCheckInCheckOut(req.query);
        return responseService.successResponse(result, MESSAGES.ATTENDANCE.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error getStudentsForCheckInCheckOut:", error);
        if (error.message.includes("Invalid Data")) return responseService.InvalidDataResponse(error.message, res);
        return responseService.errorResponse(error, res);
    }
};

export const markAttendance = async (req: Request, res: Response) => {
    try {
        const message = await attendanceService.markAttendance(req.body);
        return responseService.successResponse(null, message, res);
    } catch (error: any) {
        console.error("markAttendance error:", error);
        if (error.message.includes("Invalid Data")) return responseService.InvalidDataResponse(error.message, res);
        return responseService.errorResponse(error, res);
    }
};

export const removeCheckout = async (req: Request, res: Response) => {
    try {
        const message = await attendanceService.removeCheckout(
            req.params.studentId as string,
            req.body.checkInTime,
            req.query.client as string
        );
        return responseService.successResponse(null, message, res);
    } catch (error: any) {
        console.error("removeCheckout error:", error);
        if (error.message.includes("Invalid Data")) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const removeAttendanceSession = async (req: Request, res: Response) => {
    try {
        const message = await attendanceService.removeAttendanceSession(
            req.params.studentId as string,
            req.body.checkInTime,
            req.query.client as string
        );
        return responseService.successResponse(null, message, res);
    } catch (error: any) {
        console.error("removeAttendanceSession error:", error);
        if (error.message.includes("Invalid Data")) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const getAttendanceStatusList = async (req: Request, res: Response) => {
    try {
        const result = await attendanceService.getAttendanceStatusList(req.query);
        return responseService.successResponse(result, MESSAGES.ATTENDANCE.RETRIEVED, res);
    } catch (error: any) {
        console.error("getAttendanceStatusList error:", error);
        if (error.message.includes("Invalid Data")) return responseService.InvalidDataResponse(error.message, res);
        return responseService.errorResponse(error, res);
    }
};
