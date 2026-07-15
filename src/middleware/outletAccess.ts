import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../modules/User/model/User";
import Student from "../modules/Student/model/Student";
import Membership from "../modules/Membership/model/Membership";
import Employee from "../modules/Employee/model/Employee";
import CourseMaster from "../modules/CourseMaster/model/CourseMaster";
import { activeRecordFilter } from "../utils/softDelete";

const collectClientValues = (value: any, values: string[]) => {
    if (Array.isArray(value)) {
        value.forEach((item) => collectClientValues(item, values));
        return;
    }
    if (!value || typeof value !== "object") return;

    Object.entries(value).forEach(([key, item]) => {
        if (key === "client" && typeof item === "string") {
            values.push(item);
        } else {
            collectClientValues(item, values);
        }
    });
};

export const enforceOutletAccess = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authorization = req.headers.authorization;
        if (!authorization?.startsWith("Bearer ")) return next();

        const token = authorization.split(" ")[1];
        if (!token || token === "undefined" || token === "null") return next();

        const decoded: any = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        );
        const user: any = await User.findOne({
            username: { $regex: new RegExp(`^${decoded.username}$`, "i") },
            ...activeRecordFilter,
        }).lean();
        if (!user) return res.status(401).json({ message: "User not found" });

        (req as any).user = user;
        const role = String(user.userRole || "").toLowerCase();
        if (role === "head_office" || role === "superadmin") return next();

        const requestedClients: string[] = [];
        if (typeof req.query.client === "string") {
            requestedClients.push(req.query.client);
        }
        collectClientValues(req.body, requestedClients);

        const pathClient = req.path.match(/\/client\/([^/?]+)/i)?.[1];
        if (pathClient) requestedClients.push(decodeURIComponent(pathClient));

        const studentId =
            req.body?.student_id ||
            req.params?.studentId ||
            (req.baseUrl.endsWith("/student") ? req.params?.id : "");
        const paymentId = req.params?.paymentId;
        const student = studentId
            ? await Student.findById(studentId, { client: 1 }).lean()
            : paymentId
                ? await Student.findOne(
                    { "courses.payments._id": paymentId },
                    { client: 1 }
                ).lean()
                : null;
        if (student?.client) requestedClients.push(student.client);

        const memberId =
            req.body?.member_id ||
            req.params?.memberId ||
            (req.baseUrl.endsWith("/membership") ? req.params?.id : "");
        if (memberId) {
            const member = await Membership.findById(
                memberId,
                { client: 1 }
            ).lean();
            if (member?.client) requestedClients.push(member.client);
        }

        const employeeId =
            req.body?.employeeId ||
            (req.baseUrl.endsWith("/employee") ? req.params?.id : "");
        if (employeeId) {
            const employee = await Employee.findById(
                employeeId,
                { client: 1 }
            ).lean();
            if (employee?.client) requestedClients.push(employee.client);
        }

        if (req.baseUrl.endsWith("/course-master") && req.params?.id) {
            const courseMaster = await CourseMaster.findOne(
                { "courses._id": req.params.id },
                { client: 1 }
            ).lean();
            if (courseMaster?.client) requestedClients.push(courseMaster.client);
        }
        if (!requestedClients.length) return next();

        const assignedOutlets = Array.isArray(user.outlets) && user.outlets.length
            ? user.outlets
            : (user.clients || []).map((client: any) => client.account_name);
        const allowed = new Set(
            assignedOutlets.map((key: any) => String(key).toLowerCase())
        );
        const unauthorized = requestedClients.some(
            (client) => !allowed.has(String(client).toLowerCase())
        );

        if (unauthorized) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to access this outlet",
            });
        }
        return next();
    } catch {
        return res.status(401).json({ message: "Not authorized, token failed" });
    }
};
