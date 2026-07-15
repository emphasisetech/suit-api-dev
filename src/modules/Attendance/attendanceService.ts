import Attendance from '../Attendance/model/Attendance';
import Student from '../Student/model/Student';
import Account from '../Account/model/Account';
import mongoose from 'mongoose';

export class AttendanceService {

    async create(createDto: any) {
        delete createDto["_id"];
        return await Attendance.create(createDto);
    }

    async findAll(query: any) {
        const userId = query.userId;
        const filterQuery: any = {};
        if (userId) {
            filterQuery["attendacelist.userId"] = new mongoose.Types.ObjectId(userId as string);
        }
        return await Attendance.find(filterQuery).lean();
    }

    async findStudentAttendance(studentId: string, client?: string) {
        return await Attendance.find({
            studentId: new mongoose.Types.ObjectId(studentId),
            ...(client ? { client: { $regex: new RegExp(`^${client}$`, "i") } } : {}),
        }).lean();
    }

    async getStudentsForCheckInCheckOut(query: any) {
        const client = query.client as string;
        const date = query.date as string;
        const course_name = query.course_name as string;
        const class_batch = query.class_batch as string;

        if (!client || !date) {
            throw new Error("Invalid Data: Client and Date required");
        }

        const startOfDay = new Date(`${date}T00:00:00.000Z`);
        const endOfDay = new Date(`${date}T23:59:59.999Z`);

        // 1. Fetch Account and define official keys
        const account = await Account.findOne({
            $or: [
                { account_key: { $regex: new RegExp(`^${client}$`, "i") } },
                { "outlets.outlet_key": { $regex: new RegExp(`^${client}$`, "i") } },
            ],
        }).lean();
        if (!account) {
            throw new Error("Invalid Data: Account not found for client");
        }
        const isCourseWise = account?.attendance_type === 'course_wise';

        // Define all possible client name matches for student lookup
        const isOutletClient = account.outlets?.some(
            (outlet: any) =>
                String(outlet.outlet_key || "").toLowerCase() === client.toLowerCase()
        );
        const clientNames = [client];
        if (!isOutletClient && account?.account_name) clientNames.push(account.account_name);
        if (!isOutletClient && account?.account_key) clientNames.push(account.account_key);
        const uniqueClientNames = [...new Set(clientNames)];
        const clientMatchRegex = uniqueClientNames.map(c => new RegExp(`^${c}$`, "i"));

        // 2. Build student match query
        const studentMatch: any = {
            "student.client": { $in: clientMatchRegex },
            "student.status": 1,
        };
        if (course_name && course_name !== "All") {
            studentMatch["student.courses.course_name"] = { $regex: course_name, $options: "i" };
        }
        if (class_batch && class_batch !== "All") {
            studentMatch["student.class_batch"] = class_batch;
        }

        const checkoutListMatch: any = {
            "attendacelist.checkInTime": { $gte: startOfDay, $lte: endOfDay },
            "attendacelist.checkOutTime": { $exists: false }
        };
        if (isCourseWise && course_name && course_name !== "All") {
            checkoutListMatch["attendacelist.courseName"] = course_name;
        }

        const checkoutList = await Attendance.aggregate([
            {
                $match: {
                    client: { $regex: new RegExp(`^${client}$`, "i") },
                    attendacelist: {
                        $elemMatch: {
                            checkInTime: { $gte: startOfDay, $lte: endOfDay },
                            checkOutTime: { $exists: false },
                            ...(isCourseWise && course_name && course_name !== "All" ? { courseName: course_name } : {})
                        }
                    }
                },
            },
            { $unwind: "$attendacelist" },
            {
                $match: checkoutListMatch
            },
            {
                $lookup: {
                    from: "students",
                    localField: "studentId",
                    foreignField: "_id",
                    as: "student",
                },
            },
            { $unwind: "$student" },
            {
                $match: studentMatch,
            },
            {
                $project: {
                    _id: 0,
                    studentId: 1,
                    checkInTime: "$attendacelist.checkInTime",
                    name: "$student.name",
                    fathers_name: "$student.fathers_name",
                    phone_number: "$student.phone_number",
                    courses: "$student.courses.course_name",
                    class_batch: "$student.class_batch",
                    attendanceCourseName: "$attendacelist.courseName",
                },
            },
            { $sort: { name: 1 } },
        ]);

        const studentInitialMatch: any = {
            client: { $in: clientMatchRegex },
            status: 1,
        };
        if (course_name && course_name !== "All") {
            studentInitialMatch["courses.course_name"] = { $regex: course_name, $options: "i" };
        }
        if (class_batch && class_batch !== "All") {
            studentInitialMatch["class_batch"] = class_batch;
        }

        const studentsNotCheckedIn = await Student.aggregate([
            {
                $match: studentInitialMatch,
            },
            {
                $lookup: {
                    from: "attendances",
                    let: { sid: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$studentId", "$$sid"] },
                                        { $in: ["$client", uniqueClientNames] }
                                    ]
                                }
                            },
                        },
                        {
                            $project: {
                                recordsForToday: {
                                    $filter: {
                                        input: "$attendacelist",
                                        as: "att",
                                        cond: {
                                            $and: [
                                                { $gte: ["$$att.checkInTime", startOfDay] },
                                                { $lte: ["$$att.checkInTime", endOfDay] },
                                                ...(isCourseWise ? [
                                                    { $eq: [{ $ifNull: ["$$att.checkOutTime", null] }, null] },
                                                    ...(course_name && course_name !== "All" ? [
                                                        { $regexMatch: { input: "$$att.courseName", regex: new RegExp(`^${course_name}$`, "i") } }
                                                    ] : [])
                                                ] : [])
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    ],
                    as: "todayAttendance",
                },
            },
            {
                $addFields: {
                    filteredAttendance: {
                        $reduce: {
                            input: "$todayAttendance.recordsForToday",
                            initialValue: [],
                            in: { $concatArrays: ["$$value", "$$this"] }
                        }
                    }
                }
            },
            { $match: { "filteredAttendance.0": { $exists: false } } },
            {
                $project: {
                    _id: 0,
                    studentId: "$_id",
                    name: "$name",
                    fathers_name: "$fathers_name",
                    phone_number: "$phone_number",
                    courses: "$courses.course_name",
                    class_batch: "$class_batch",
                },
            },
            { $sort: { name: 1 } },
        ]);

        return { studentsNotCheckedIn: studentsNotCheckedIn || [], checkedInNotOut: checkoutList || [] };
    }

    async markAttendance(payload: any) {
        const { selectedStudents, selectedDate, actionTime: passedActionTime, type, client, userId, courseName, batchName } = payload;

        if (!userId && type === 'check-in') {
            throw new Error("Invalid Data: userId required for check-in");
        }

        const account = await Account.findOne({
            $or: [
                { account_key: { $regex: new RegExp(`^${client}$`, "i") } },
                { "outlets.outlet_key": { $regex: new RegExp(`^${client}$`, "i") } },
            ],
        }).lean();
        if (!account) {
            throw new Error("Invalid Data: Account not found for client");
        }
        const isCourseWise = account?.attendance_type === 'course_wise';

        const date = selectedDate;
        const startOfDay = new Date(`${date}T00:00:00.000Z`);
        const endOfDay = new Date(`${date}T23:59:59.999Z`);

        let actionTime;
        if (passedActionTime) {
            actionTime = new Date(passedActionTime);
        } else {
            const now = new Date();
            actionTime = new Date(`${date}T00:00:00.000Z`);
            actionTime.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
        }

        const selectedStudentIds = selectedStudents.map(
            (studentId: string) => new mongoose.Types.ObjectId(studentId)
        );
        const outletStudentCount = await Student.countDocuments({
            _id: { $in: selectedStudentIds },
            client: { $regex: new RegExp(`^${client}$`, "i") },
        });
        if (outletStudentCount !== selectedStudentIds.length) {
            throw new Error("Invalid Data: Student does not belong to selected outlet");
        }

        const operations = [];

        for (const studentId of selectedStudents) {
            if (type === "check-in") {
                operations.push({
                    updateOne: {
                        filter: { studentId: new mongoose.Types.ObjectId(studentId), client: client },
                        update: {
                            $push: {
                                attendacelist: {
                                    userId: new mongoose.Types.ObjectId(userId),
                                    checkInTime: actionTime,
                                    courseName: isCourseWise ? courseName : undefined,
                                    batchName: isCourseWise ? batchName : undefined,
                                }
                            }
                        },
                        upsert: true,
                    },
                });
            }

            if (type === "check-out") {
                operations.push({
                    updateOne: {
                        filter: {
                            studentId: new mongoose.Types.ObjectId(studentId),
                            client: client.toLowerCase(),
                        },
                        update: {
                            $set: { "attendacelist.$[elem].checkOutTime": actionTime },
                        },
                        arrayFilters: [
                            {
                                "elem.checkInTime": { $gte: startOfDay, $lte: endOfDay },
                                "elem.checkOutTime": { $exists: false },
                                ...(isCourseWise && courseName && courseName !== "All" ? { "elem.courseName": courseName } : {})
                            }
                        ]
                    },
                });
            }
        }

        if (!operations.length) {
            throw new Error("Invalid Data: Invalid attendance request");
        }

        await Attendance.bulkWrite(operations);
        return type === "check-in" ? "Students checked in successfully" : "Students checked out successfully";
    }

    async removeCheckout(studentId: string, checkInTime: string, client?: string) {
        if (!studentId || !checkInTime) {
            throw new Error("Invalid Data: Student and check-in time required");
        }

        const result = await Attendance.updateOne(
            {
                studentId: new mongoose.Types.ObjectId(studentId),
                ...(client ? { client: { $regex: new RegExp(`^${client}$`, "i") } } : {}),
                attendacelist: {
                    $elemMatch: {
                        checkInTime: new Date(checkInTime),
                        checkOutTime: { $exists: true },
                    },
                },
            },
            {
                $unset: { "attendacelist.$[elem].checkOutTime": "" },
            },
            {
                arrayFilters: [
                    {
                        "elem.checkInTime": new Date(checkInTime),
                        "elem.checkOutTime": { $exists: true },
                    },
                ],
            }
        );

        if (!result.modifiedCount) {
            throw new Error("Invalid Data: Checkout record not found");
        }

        return "Student checkout removed successfully";
    }

    async removeAttendanceSession(studentId: string, checkInTime: string, client?: string) {
        if (!studentId || !checkInTime) {
            throw new Error("Invalid Data: Student and check-in time required");
        }

        const result = await Attendance.updateOne(
            {
                studentId: new mongoose.Types.ObjectId(studentId),
                ...(client ? { client: { $regex: new RegExp(`^${client}$`, "i") } } : {}),
            },
            {
                $pull: {
                    attendacelist: {
                        checkInTime: new Date(checkInTime),
                    },
                },
            }
        );

        if (!result.modifiedCount) {
            throw new Error("Invalid Data: Attendance record not found");
        }

        return "Student attendance removed successfully";
    }

    async getAttendanceStatusList(query: any) {
        const { client, date } = query;
        if (!client || !date) {
            throw new Error("Invalid Data: Client and Date required");
        }

        const startOfDay = new Date(`${date}T00:00:00.000Z`);
        const endOfDay = new Date(`${date}T23:59:59.999Z`);
        const account = await Account.findOne({
            $or: [
                { account_key: { $regex: new RegExp(`^${client}$`, "i") } },
                { "outlets.outlet_key": { $regex: new RegExp(`^${client}$`, "i") } },
            ],
        }).lean();
        if (!account) {
            throw new Error("Invalid Data: Account not found for client");
        }
        const clientNames = [client];
        if (account?.account_key) clientNames.push(account.account_key);

        console.log("getAttendanceStatusList query:", { client, date });

        const result = await Attendance.aggregate([
            {
                $match: {
                    client:  { $regex: new RegExp(`^${client}$`, "i") },
                    attendacelist: {
                        $elemMatch: {
                            checkInTime: { $gte: startOfDay, $lte: endOfDay }
                        }
                    }
                }
            },
            { $unwind: "$attendacelist" },
            {
                $match: {
                    "attendacelist.checkInTime": { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $lookup: {
                    from: "students",
                    localField: "studentId",
                    foreignField: "_id",
                    as: "student",
                },
            },
            { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    studentId: 1,
                    checkInTime: "$attendacelist.checkInTime",
                    checkOutTime: "$attendacelist.checkOutTime",
                    courseName: "$attendacelist.courseName",
                    batchName: "$attendacelist.batchName",
                    name: "$student.name",
                    fathers_name: "$student.fathers_name",
                    phone_number: "$student.phone_number",
                    courses: "$student.courses.course_name",
                    class_batch: "$student.class_batch",
                }
            }
        ]);

        console.log("getAttendanceStatusList result count:", result.length);
        return result;
    }
}
