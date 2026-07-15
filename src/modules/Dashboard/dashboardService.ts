import Student from '../Student/model/Student';
import Account from '../Account/model/Account';
import User from '../User/model/User';
import Membership from '../Membership/model/Membership';
import MembershipType from '../Membership/model/MembershipType';
import Employee from '../Employee/model/Employee';
import EmployeeAttendance from '../Employee/model/EmployeeAttendance';
import { activeRecordFilter } from '../../utils/softDelete';
import moment from 'moment';

const safeDateFromString = (dateString: string) => ({
    $dateFromString: {
        dateString,
        onError: null,
        onNull: null,
    },
});

export class DashboardService {
    async getDashboardTiles(client: string, payload: any = {}) {
        const userRole = payload?.userRole?.toLowerCase();
        const filterQuery: any = {
            client: { $regex: `^${client}$`, $options: "i" }
        };

        // 1. Students Count
        const studentsCount = await Student.countDocuments(filterQuery);
        const activeStudentsCount = await Student.countDocuments({ ...filterQuery, status: 1 });
        const inactiveStudentsCount = await Student.countDocuments({ ...filterQuery, status: 0 });
        const totalMembers = await Membership.countDocuments(filterQuery);
        const activeMembers = await Membership.countDocuments({ ...filterQuery, status: 1 });
        const inactiveMembers = await Membership.countDocuments({ ...filterQuery, status: 0 });
        const membershipTypesCount = await MembershipType.countDocuments(filterQuery);
        const employeeFilterQuery: any = { ...filterQuery, ...activeRecordFilter };
        const activeEmployees = await Employee.find({ ...employeeFilterQuery, status: 1 }, { _id: 1 }).lean();
        const activeEmployeeIds = activeEmployees.map((employee: any) => employee._id);
        const totalEmployees = activeEmployeeIds.length;
        const todayDateKey = moment().format('YYYY-MM-DD');
        const todayEmployeeAttendanceFilter = {
            client: { $regex: `^${client}$`, $options: "i" },
            date: todayDateKey,
            $or: [
                { employeeId: { $in: activeEmployeeIds } },
                { teacherId: { $in: activeEmployeeIds } },
            ],
        };
        const presentEmployees = await EmployeeAttendance.countDocuments({
            ...todayEmployeeAttendanceFilter,
            status: "Present",
        });
        const absentEmployees = await EmployeeAttendance.countDocuments({
            ...todayEmployeeAttendanceFilter,
            status: "Absent",
        });

        // 2. Accounts  Count
        const accountsCount = await Account.countDocuments({ status: 1 });

        // 3. Users Count
        const userQuery: any = {
            userType: "Client",
            $or: [
                { outlets: { $regex: `^${client}$`, $options: "i" } },
                {
                    "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                    outlets: { $size: 0 },
                },
                {
                    "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                    userRole: "head_office",
                },
            ],
        };
        const usersCount = await User.countDocuments(userQuery);

        // 4. Courses Aggregation
        const coursesAggregation = await Student.aggregate([
            { $match: { client: { $regex: `^${client}$`, $options: "i" } } },
            { $unwind: "$courses" },
            {
                $group: {
                    _id: null,
                    totalCourses: { $sum: 1 },
                    activeCourses: {
                        $sum: { $cond: [{ $eq: ["$courses.course_status", 1] }, 1, 0] }
                    },
                    completedCourses: {
                        $sum: { $cond: [{ $eq: ["$courses.course_status", 0] }, 1, 0] }
                    }
                }
            }
        ]);

        // 5. Payments Aggregation
        const startOfThisMonth = moment().startOf('month').toDate();
        const startOfLastMonth = moment().subtract(1, 'month').startOf('month').toDate();
        const endOfLastMonth = moment().subtract(1, 'month').endOf('month').toDate();
        const startOfThisYear = moment().startOf('year').toDate();
        const coursePaymentDate = safeDateFromString("$courses.payments.payment_date");
        const membershipPaymentDate = safeDateFromString("$payments.payment_date");

        const paymentsAggregation = await Student.aggregate([
            {
                $match: {
                    client: { $regex: `^${client}$`, $options: "i" },
                },
            },
            { $unwind: "$courses" },
            { $unwind: "$courses.payments" },
            {
                $group: {
                    _id: null,
                    paymentsCount: { $sum: 1 },
                    totalPaymentAmount: { $sum: "$courses.payments.payment_amount" },
                    thisMonthPaymentAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: [coursePaymentDate, startOfThisMonth] }
                                    ]
                                },
                                "$courses.payments.payment_amount",
                                0
                            ]
                        }
                    },
                    lastMonthPaymentAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: [coursePaymentDate, startOfLastMonth] },
                                        { $lte: [coursePaymentDate, endOfLastMonth] }
                                    ]
                                },
                                "$courses.payments.payment_amount",
                                0
                            ]
                        }
                    },
                    thisYearPaymentAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: [coursePaymentDate, startOfThisYear] }
                                    ]
                                },
                                "$courses.payments.payment_amount",
                                0
                            ]
                        }
                    }
                },
            },
        ]);

        const membershipPaymentsAggregation = await Membership.aggregate([
            {
                $match: {
                    client: { $regex: `^${client}$`, $options: "i" },
                },
            },
            { $unwind: "$payments" },
            {
                $group: {
                    _id: null,
                    membershipPaymentsCount: { $sum: 1 },
                    totalMembershipPaymentAmount: { $sum: "$payments.payment_amount" },
                    thisMonthMembershipPaymentAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: [membershipPaymentDate, startOfThisMonth] }
                                    ]
                                },
                                "$payments.payment_amount",
                                0
                            ]
                        }
                    },
                    thisYearMembershipPaymentAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: [membershipPaymentDate, startOfThisYear] }
                                    ]
                                },
                                "$payments.payment_amount",
                                0
                            ]
                        }
                    }
                },
            },
        ]);

        return {
            studentsCount,
            activeStudentsCount,
            inactiveStudentsCount,
            totalMembers,
            activeMembers,
            inactiveMembers,
            membershipTypesCount,
            totalEmployees,
            presentEmployees,
            absentEmployees,
            accountsCount,
            usersCount,
            totalCourses: coursesAggregation[0]?.totalCourses || 0,
            activeCourses: coursesAggregation[0]?.activeCourses || 0,
            completedCourses: coursesAggregation[0]?.completedCourses || 0,
            inactiveCourses: 0, // Placeholder as no distinction currently exists
            paymentsCount: paymentsAggregation[0]?.paymentsCount || 0,
            totalPaymentAmount: paymentsAggregation[0]?.totalPaymentAmount || 0,
            thisMonthPaymentAmount: paymentsAggregation[0]?.thisMonthPaymentAmount || 0,
            lastMonthPaymentAmount: paymentsAggregation[0]?.lastMonthPaymentAmount || 0,
            thisYearPaymentAmount: paymentsAggregation[0]?.thisYearPaymentAmount || 0,
            membershipPaymentsCount: userRole === "user" ? 0 : (membershipPaymentsAggregation[0]?.membershipPaymentsCount || 0),
            totalMembershipPaymentAmount: userRole === "user" ? 0 : (membershipPaymentsAggregation[0]?.totalMembershipPaymentAmount || 0),
            thisMonthMembershipPaymentAmount: userRole === "user" ? 0 : (membershipPaymentsAggregation[0]?.thisMonthMembershipPaymentAmount || 0),
            thisYearMembershipPaymentAmount: userRole === "user" ? 0 : (membershipPaymentsAggregation[0]?.thisYearMembershipPaymentAmount || 0),
        };
    }

    async getDashboardTileDetails(client: string, heading: string, payload: any = {}) {
        const userRole = payload?.userRole?.toLowerCase();
        const year = payload?.year || moment().year().toString();
        const filterQuery: any = {
            client: { $regex: `^${client}$`, $options: "i" }
        };

        const startOfThisMonth = moment().startOf('month').toDate();
        const startOfLastMonth = moment().subtract(1, 'month').startOf('month').toDate();
        const endOfLastMonth = moment().subtract(1, 'month').endOf('month').toDate();

        const startOfYear = moment(year, 'YYYY').startOf('year').toDate();
        const endOfYear = moment(year, 'YYYY').endOf('year').toDate();
        const coursePaymentDate = safeDateFromString("$courses.payments.payment_date");
        const membershipPaymentDate = safeDateFromString("$payments.payment_date");

        const studentProjection = {
            name: 1,
            fathers_name: 1,
            phone_number: 1,
            status: 1,
            "courses.course_name": 1,
            "courses.course_status": 1,
            "courses.course_start_date": 1,
            createdAt: 1
        };

        switch (heading) {
            case "Total Students":
                return await Student.find(filterQuery, studentProjection);
            case "Active Students":
                return await Student.find({ ...filterQuery, status: 1 }, studentProjection);
            case "Inactive Students":
                return await Student.find({ ...filterQuery, status: 0 }, studentProjection);
            case "Total Members":
                return await Membership.find(filterQuery, { name: 1, phone_number: 1, membership_type: 1, status: 1, total_pending_fee: 1, createdAt: 1 });
            case "Active Members":
                return await Membership.find({ ...filterQuery, status: 1 }, { name: 1, phone_number: 1, membership_type: 1, status: 1, total_pending_fee: 1, createdAt: 1 });
            case "Inactive Members":
                return await Membership.find({ ...filterQuery, status: 0 }, { name: 1, phone_number: 1, membership_type: 1, status: 1, total_pending_fee: 1, createdAt: 1 });
            case "Membership Types":
                return await MembershipType.find(filterQuery, { membership_type: 1, fee: 1, fee_ferquency: 1, registration_required: 1, registration_fee: 1, status: 1, createdAt: 1 });
            case "Total Employees":
                return await Employee.find({ ...filterQuery, ...activeRecordFilter, status: 1 }, { name: 1, phone: 1, email: 1, designation: 1, status: 1, createdAt: 1 });
            case "Present Employees":
            case "Absent Employees": {
                const attendanceStatus = heading === "Present Employees" ? "Present" : "Absent";
                return await EmployeeAttendance.aggregate([
                    {
                        $match: {
                            client: { $regex: `^${client}$`, $options: "i" },
                            date: moment().format('YYYY-MM-DD'),
                            status: attendanceStatus,
                        },
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "employeeId",
                            foreignField: "_id",
                            as: "employee",
                        },
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "teacherId",
                            foreignField: "_id",
                            as: "teacher",
                        },
                    },
                    {
                        $addFields: {
                            employeeData: {
                                $ifNull: [
                                    { $arrayElemAt: ["$employee", 0] },
                                    { $arrayElemAt: ["$teacher", 0] },
                                ],
                            },
                        },
                    },
                    {
                        $match: {
                            "employeeData.deleted": { $ne: true },
                        },
                    },
                    {
                        $project: {
                            _id: "$employeeData._id",
                            name: "$employeeData.name",
                            phone: "$employeeData.phone",
                            email: "$employeeData.email",
                            designation: "$employeeData.designation",
                            attendance_status: "$status",
                            workHours: 1,
                            reason: 1,
                            date: 1,
                            createdAt: "$employeeData.createdAt",
                        },
                    },
                ]);
            }
            case "Active Accounts":
                return await Account.find({ status: 1 }, { account_name: 1, account_owner: 1, city: 1, status: 1, createdAt: 1 });
            case "Active Users":
                const userQuery: any = {
                    userType: "Client",
                    $or: [
                        { outlets: { $regex: `^${client}$`, $options: "i" } },
                        {
                            "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                            outlets: { $size: 0 },
                        },
                        {
                            "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                            userRole: "head_office",
                        },
                    ],
                };
                return await User.find(userQuery, { username: 1, role: 1, status: 1, createdAt: 1 });
            case "Total Courses":
            case "Active Courses":
            case "Completed Courses":
                const coursesAggregation = await Student.aggregate([
                    { $match: { client: { $regex: `^${client}$`, $options: "i" } } },
                    { $unwind: "$courses" },
                    ...(heading === "Active Courses" ? [{ $match: { "courses.course_status": 1 } }] : []),
                    ...(heading === "Completed Courses" ? [{ $match: { "courses.course_status": 0 } }] : []),
                    {
                        $project: {
                            _id: 0,
                            name: "$name",
                            course_name: "$courses.course_name",
                            course_status: "$courses.course_status",
                            course_fee: "$courses.course_fee",
                            course_duration: "$courses.course_duration",
                            course_start_date: "$courses.course_start_date"
                        }
                    }
                ]);
                return coursesAggregation;
            case "Total Payments":
            case "This Month":
            case "Last Month":
            case "Payments Count":
                const paymentsAggregation = await Student.aggregate([
                    { $match: { client: { $regex: `^${client}$`, $options: "i" } } },
                    { $unwind: "$courses" },
                    { $unwind: "$courses.payments" },
                    ...(heading === "Total Payments" || heading === "Payments Count" || heading === "This Month" || heading === "Last Month" ? [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $gte: [coursePaymentDate, startOfYear] },
                                        { $lte: [coursePaymentDate, endOfYear] }
                                    ]
                                }
                            }
                        }
                    ] : []),
                    {
                        $project: {
                            _id: 0,
                            student_name: "$name",
                            payment_amount: "$courses.payments.payment_amount",
                            payment_date: "$courses.payments.payment_date",
                            payment_mode: "$courses.payments.payment_mode"
                        }
                    }
                ]);
                return paymentsAggregation;
            case "Membership Payments":
            case "Membership Payment Count":
                if (userRole === "user") return [];
                return await Membership.aggregate([
                    { $match: { client: { $regex: `^${client}$`, $options: "i" } } },
                    { $unwind: "$payments" },
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $gte: [membershipPaymentDate, startOfYear] },
                                    { $lte: [membershipPaymentDate, endOfYear] }
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            member_name: "$name",
                            membership_type: "$membership_type",
                            payment_amount: "$payments.payment_amount",
                            payment_date: "$payments.payment_date",
                            payment_mode: "$payments.payment_mode"
                        }
                    }
                ]);
            default:
                return [];
        }
    }

    async getBirthdays(client: string) {
        const students = await Student.find({
            client: { $regex: `^${client}$`, $options: "i" },
            dob: { $exists: true, $ne: "" },
            status: 1
        });

        const users = await User.find({
            dob: { $exists: true, $ne: "" },
            $or: [
                { outlets: { $regex: `^${client}$`, $options: "i" } },
                {
                    "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                    outlets: { $size: 0 },
                },
                {
                    "clients.account_name": { $regex: `^${client}$`, $options: "i" },
                    userRole: "head_office",
                },
            ],
        });
        const employees = await Employee.find({
            client: { $regex: `^${client}$`, $options: "i" },
            dob: { $exists: true, $ne: "" },
            status: 1,
            ...activeRecordFilter,
        });

        const filterBirthdays = (list: any[]) => {
            return list.filter(item => {
                const bday = moment(item.dob, ["YYYY-MM-DD", "DD-MM-YYYY"]);
                if (!bday.isValid()) return false;

                const thisYearBday = bday.clone().year(moment().year());
                return thisYearBday.isBetween(moment().startOf('week'), moment().endOf('week'), null, '[]');
            });
        };

        return {
            students: filterBirthdays(students).map(s => ({
                name: s.name,
                dob: s.dob,
                phone: s.phone_number,
                type: 'Student'
            })),
            users: filterBirthdays(users).map(u => ({
                name: u.name,
                dob: u.dob,
                phone: u.phone_number,
                type: 'User'
            })),
            employees: filterBirthdays(employees).map(e => ({
                name: e.name,
                dob: e.dob,
                phone: e.phone,
                type: 'Employee'
            }))
        };
    }
}
