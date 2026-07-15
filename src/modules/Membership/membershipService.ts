import mongoose from "mongoose";
import moment from "moment";
import Membership from "./model/Membership";
import MembershipAttendance from "./model/MembershipAttendance";
import MembershipType from "./model/MembershipType";
import { PaymentFrequency, PaymentStatus } from "../../enums/studentEnums";
import { assertAllowedEmail } from "../../utils/emailValidation";
import { activeRecordFilter, getSoftDeleteUpdate } from "../../utils/softDelete";

export class MembershipService {
  async create(createDto: any) {
    assertAllowedEmail(createDto.email);
    delete createDto._id;
    if (!createDto.name || !createDto.client || !createDto.membership_type) {
      throw new Error("MEMBERSHIP.INVALID_DATA");
    }
    await this.applyTypeDefaults(createDto);
    const existing = await Membership.findOne({
      ...activeRecordFilter,
      client: { $regex: new RegExp(`^${createDto.client}$`, "i") },
      name: { $regex: new RegExp(`^${createDto.name}$`, "i") },
      phone_number: createDto.phone_number || "",
    });
    if (existing) throw new Error("MEMBERSHIP.DUPLICATE");
    const member = await Membership.create(createDto);
    await this.calculatePendingFee(member._id.toString());
    return member;
  }

  async findAll(query: any) {
    const { client, search, status } = query;
    const filter: any = { ...activeRecordFilter };
    if (client) filter.client = { $regex: new RegExp(`^${client}$`, "i") };
    if (status) filter.status = Number(status);
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone_number: { $regex: search, $options: "i" } },
        { membership_type: { $regex: search, $options: "i" } },
      ];
    }
    const members = await Membership.find(filter).sort({ createdAt: -1 });
    const result = [];
    for (const member of members) {
      await this.calculatePendingFee(member._id.toString(), member);
      result.push(member.toObject());
    }
    return result;
  }

  async findById(id: string) {
    const member = await Membership.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!member) throw new Error("MEMBERSHIP.NOT_FOUND");
    return member;
  }

  async update(id: string, updateDto: any) {
    assertAllowedEmail(updateDto.email);
    delete updateDto._id;
    delete updateDto.client;
    if (updateDto.name !== undefined && !updateDto.name) {
      throw new Error("MEMBERSHIP.INVALID_DATA");
    }
    if (updateDto.membership_type !== undefined && !updateDto.membership_type) {
      throw new Error("MEMBERSHIP.INVALID_DATA");
    }
    await this.applyTypeDefaults(updateDto);
    const member = await Membership.findOneAndUpdate({ _id: id, ...activeRecordFilter }, updateDto, { new: true, runValidators: true });
    if (!member) throw new Error("MEMBERSHIP.NOT_FOUND");
    await this.calculatePendingFee(member._id.toString(), member);
    return member.toObject();
  }

  async changeStatus(id: string) {
    const member = await Membership.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!member) throw new Error("MEMBERSHIP.NOT_FOUND");
    return Membership.findOneAndUpdate({ _id: id, ...activeRecordFilter }, { status: member.status ? 0 : 1 }, { new: true }).lean();
  }

  async delete(id: string, payload: any = {}) {
    const result = await Membership.findOneAndUpdate(
      { _id: id, ...activeRecordFilter },
      { $set: getSoftDeleteUpdate(payload) },
      { new: true }
    ).lean();
    if (!result) throw new Error("MEMBERSHIP.NOT_FOUND");
    return null;
  }

  async addPayment(memberId: string, paymentDto: any) {
    const member = await Membership.findOne({ _id: memberId, ...activeRecordFilter });
    if (!member) throw new Error("MEMBERSHIP.NOT_FOUND");

    const slipNumbers = await Membership.aggregate([
      { $match: { ...activeRecordFilter, client: { $regex: `^${member.client}$`, $options: "i" } } },
      { $unwind: "$payments" },
      { $group: { _id: null, slip_numbers: { $addToSet: "$payments.slip_number" } } },
    ]);
    const client = member.client.toUpperCase();
    const prefix = client.includes("_")
      ? client.split("_").map((word) => word.charAt(0)).join("")
      : client.substring(0, 4);
    const slipNumber = `MEM${prefix}${String((slipNumbers[0]?.slip_numbers?.length || 0) + 1).padStart(6, "0")}`;
    member.payments.push({ ...paymentDto, slip_number: slipNumber });
    member.total_paid = member.payments.reduce(
      (sum: number, payment: any) =>
        payment.payment_status === PaymentStatus.REJECTED ? sum : sum + Number(payment.payment_amount || 0),
      0,
    );
    await member.save();
    await this.calculatePendingFee(member._id.toString(), member);
    return member;
  }

  private async applyTypeDefaults(memberData: any) {
    if (!memberData.client || !memberData.membership_type) return;
    const membershipType = await MembershipType.findOne({
      ...activeRecordFilter,
      client: { $regex: new RegExp(`^${memberData.client}$`, "i") },
      membership_type: { $regex: new RegExp(`^${memberData.membership_type}$`, "i") },
    }).lean();
    if (!membershipType) return;

    if (memberData.membership_fee === undefined || memberData.membership_fee === "") {
      memberData.membership_fee = membershipType.fee || 0;
    }
    if (!memberData.fee_ferquency) {
      memberData.fee_ferquency = membershipType.fee_ferquency || PaymentFrequency.MONTHLY;
    }
    if (memberData.registration_required === undefined) {
      memberData.registration_required = membershipType.registration_required || false;
    }
    if (memberData.registration_fee === undefined || memberData.registration_fee === "") {
      memberData.registration_fee = membershipType.registration_required ? membershipType.registration_fee || 0 : 0;
    }
  }

  private _calculateMemberFees(member: any, membershipType: any) {
    const fee = Number(member.membership_fee ?? membershipType?.fee ?? 0);
    const freq = member.fee_ferquency || membershipType?.fee_ferquency || PaymentFrequency.MONTHLY;
    const startDate = moment(member.start_date && member.start_date !== "" ? member.start_date : member.createdAt);
    const targetDate = member.end_date ? moment(member.end_date) : moment();
    const durationStr = membershipType?.duration || "";
    const durationMatch = durationStr.match(/(\d+)/);
    const maxMonths = durationMatch ? parseInt(durationMatch[1], 10) : Infinity;
    const diffMonths = Math.max(targetDate.diff(startDate, "months"), 0);
    const diffYears = Math.max(targetDate.diff(startDate, "years"), 0);

    let periodsDue = 1;
    let maxPeriods = 1;

    switch (freq) {
      case PaymentFrequency.MONTHLY:
        periodsDue = diffMonths + 1;
        maxPeriods = maxMonths;
        break;
      case PaymentFrequency.QUATERLY:
        periodsDue = Math.floor(diffMonths / 3) + 1;
        maxPeriods = Math.ceil(maxMonths / 3);
        break;
      case PaymentFrequency.HALF_YEARLY:
        periodsDue = Math.floor(diffMonths / 6) + 1;
        maxPeriods = Math.ceil(maxMonths / 6);
        break;
      case PaymentFrequency.YEARLY:
        periodsDue = diffYears + 1;
        maxPeriods = Math.ceil(maxMonths / 12);
        break;
      case PaymentFrequency.LUM_SUM:
        periodsDue = 1;
        maxPeriods = 1;
        break;
      default:
        periodsDue = diffMonths + 1;
        maxPeriods = maxMonths;
    }

    if (maxPeriods <= 0 || maxPeriods === Infinity || isNaN(maxPeriods)) maxPeriods = periodsDue;

    const cappedPeriodsDue = Math.max(Math.min(periodsDue, maxPeriods), 0);
    const expected =
      fee * cappedPeriodsDue + (member.registration_required ? Number(member.registration_fee || 0) : 0);
    const totalPaid = (member.payments || []).reduce(
      (sum: number, payment: any) =>
        payment.payment_status === PaymentStatus.REJECTED ? sum : sum + Number(payment.payment_amount || 0),
      0,
    );

    member.total_paid = Number(totalPaid.toFixed(2));
    member.total_pending_fee = Math.max(Number((expected - totalPaid).toFixed(2)), 0);
    return member.total_pending_fee;
  }

  async calculatePendingFee(memberId: string, existingMember?: any) {
    const member = existingMember || await Membership.findOne({ _id: memberId, ...activeRecordFilter });
    if (!member) throw new Error("MEMBERSHIP.NOT_FOUND");

    const membershipType = await MembershipType.findOne({
      ...activeRecordFilter,
      client: { $regex: new RegExp(`^${member.client}$`, "i") },
      membership_type: { $regex: new RegExp(`^${member.membership_type}$`, "i") },
    }).lean();

    this._calculateMemberFees(member, membershipType);
    await member.save();
    return { member, totalPending: member.total_pending_fee };
  }

  async updatePendingFeesByType(client: string, membershipTypeName: string) {
    const members = await Membership.find({
      ...activeRecordFilter,
      client: { $regex: new RegExp(`^${client}$`, "i") },
      membership_type: { $regex: new RegExp(`^${membershipTypeName}$`, "i") },
    });
    for (const member of members) {
      await this.calculatePendingFee(member._id.toString(), member);
    }
  }

  async findAllPayments(query: any) {
    const { client, search, pageNum = 1, count = 10, year, month } = query;
    const skip = (Number(pageNum) - 1) * Number(count);
    const limit = Number(count);
    const pipeline: any[] = [];
    if (client) pipeline.push({ $match: { ...activeRecordFilter, client: { $regex: new RegExp(`^${client}$`, "i") } } });
    pipeline.push({ $unwind: "$payments" });
    if (year) {
      pipeline.push({
        $match: {
          $expr: {
            $eq: [{ $year: { $dateFromString: { dateString: "$payments.payment_date" } } }, Number(year)],
          },
        },
      });
    }
    if (month !== undefined && month !== "") {
      pipeline.push({
        $match: {
          $expr: {
            $eq: [{ $month: { $dateFromString: { dateString: "$payments.payment_date" } } }, Number(month) + 1],
          },
        },
      });
    }
    pipeline.push({
      $project: {
        _id: "$payments._id",
        member_id: "$_id",
        member_name: "$name",
        member_phone_number: "$phone_number",
        member_whatsapp_number: "$whatsapp_number",
        membership_type: "$membership_type",
        slip_number: "$payments.slip_number",
        payment_amount: "$payments.payment_amount",
        payment_date: "$payments.payment_date",
        remarks: "$payments.remarks",
        payment_status: "$payments.payment_status",
        payment_mode: "$payments.payment_mode",
        createdAt: "$payments.createdAt",
      },
    });
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { member_name: { $regex: search, $options: "i" } },
            { slip_number: { $regex: search, $options: "i" } },
            { remarks: { $regex: search, $options: "i" } },
            { membership_type: { $regex: search, $options: "i" } },
          ],
        },
      });
    }
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $facet: { data: [{ $skip: skip }, { $limit: limit }], totalCount: [{ $count: "count" }] } });
    const result = await Membership.aggregate(pipeline);
    return {
      payments: result[0]?.data || [],
      totalCount: result[0]?.totalCount?.[0]?.count || 0,
      pageNum: Number(pageNum),
      count: limit,
    };
  }

  async getPaymentReceipt(paymentId: string) {
    const pipeline: any[] = [
      { $match: { ...activeRecordFilter, "payments._id": new mongoose.Types.ObjectId(paymentId) } },
      { $unwind: "$payments" },
      { $match: { "payments._id": new mongoose.Types.ObjectId(paymentId) } },
      {
        $project: {
          _id: "$payments._id",
          member_id: "$_id",
          client: "$client",
          member_name: "$name",
          member_phone_number: "$phone_number",
          member_whatsapp_number: "$whatsapp_number",
          membership_type: "$membership_type",
          slip_number: "$payments.slip_number",
          payment_amount: "$payments.payment_amount",
          payment_date: "$payments.payment_date",
          remarks: "$payments.remarks",
          payment_status: "$payments.payment_status",
          payment_mode: "$payments.payment_mode",
          createdAt: "$payments.createdAt",
        },
      },
      {
        $lookup: {
          from: "accounts",
          let: { recordClient: "$client" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$account_key", "$$recordClient"] },
                    { $in: ["$$recordClient", "$outlets.outlet_key"] },
                  ],
                },
              },
            },
          ],
          as: "accountData",
        },
      },
      {
        $unwind: {
          path: "$accountData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          account_name: { $ifNull: ["$accountData.account_name", "E-TECH TRAINING CENTER"] },
        },
      },
      {
        $project: {
          accountData: 0,
          client: 0,
        },
      },
    ];

    const result = await Membership.aggregate(pipeline);
    if (!result || result.length === 0) {
      throw new Error("PAYMENTS.NOT_FOUND");
    }

    return result[0];
  }

  async getAttendance(memberId: string) {
    return MembershipAttendance.find({ memberId: new mongoose.Types.ObjectId(memberId) }).lean();
  }

  async getMembersForCheckInCheckOut(query: any) {
    const { client, date, membership_type } = query;
    if (!client || !date) throw new Error("Invalid Data: Client and Date required");
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    const memberMatch: any = {
      client: { $regex: new RegExp(`^${client}$`, "i") },
      status: 1,
      ...activeRecordFilter,
    };
    if (membership_type && membership_type !== "All") memberMatch.membership_type = membership_type;

    const checkedInNotOut = await MembershipAttendance.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
          attendacelist: {
            $elemMatch: {
              checkInTime: { $gte: startOfDay, $lte: endOfDay },
              checkOutTime: { $exists: false },
            },
          },
        },
      },
      { $unwind: "$attendacelist" },
      {
        $match: {
          "attendacelist.checkInTime": { $gte: startOfDay, $lte: endOfDay },
          "attendacelist.checkOutTime": { $exists: false },
        },
      },
      { $lookup: { from: "memberships", localField: "memberId", foreignField: "_id", as: "member" } },
      { $unwind: "$member" },
      { $match: membership_type && membership_type !== "All" ? { "member.membership_type": membership_type } : {} },
      {
        $project: {
          _id: 0,
          memberId: 1,
          checkInTime: "$attendacelist.checkInTime",
          name: "$member.name",
          phone_number: "$member.phone_number",
          membership_type: "$member.membership_type",
        },
      },
      { $sort: { name: 1 } },
    ]);

    const membersNotCheckedIn = await Membership.aggregate([
      { $match: memberMatch },
      {
        $lookup: {
          from: "membershipattendances",
          let: { mid: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$memberId", "$$mid"] }, { $eq: ["$client", client] }] } } },
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
                      ],
                    },
                  },
                },
              },
            },
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
              in: { $concatArrays: ["$$value", "$$this"] },
            },
          },
        },
      },
      { $match: { "filteredAttendance.0": { $exists: false } } },
      {
        $project: {
          _id: 0,
          memberId: "$_id",
          name: 1,
          phone_number: 1,
          membership_type: 1,
        },
      },
      { $sort: { name: 1 } },
    ]);

    return { membersNotCheckedIn, checkedInNotOut };
  }

  async markAttendance(payload: any) {
    const { selectedMembers, selectedDate, actionTime: passedActionTime, type, client, userId } = payload;
    if (!userId && type === "check-in") throw new Error("Invalid Data: userId required for check-in");
    const date = selectedDate || moment().format("YYYY-MM-DD");
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    const actionTime = passedActionTime ? new Date(passedActionTime) : new Date();
    const operations = [];

    for (const memberId of selectedMembers || []) {
      if (type === "check-in") {
        operations.push({
          updateOne: {
            filter: { memberId: new mongoose.Types.ObjectId(memberId), client },
            update: {
              $push: {
                attendacelist: {
                  userId: new mongoose.Types.ObjectId(userId),
                  checkInTime: actionTime,
                },
              },
            },
            upsert: true,
          },
        });
      }
      if (type === "check-out") {
        operations.push({
          updateOne: {
            filter: { memberId: new mongoose.Types.ObjectId(memberId), client },
            update: { $set: { "attendacelist.$[elem].checkOutTime": actionTime } },
            arrayFilters: [
              {
                "elem.checkInTime": { $gte: startOfDay, $lte: endOfDay },
                "elem.checkOutTime": { $exists: false },
              },
            ],
          },
        });
      }
    }

    if (!operations.length) throw new Error("Invalid Data: Invalid attendance request");
    await MembershipAttendance.bulkWrite(operations);
    return type === "check-in" ? "Members checked in successfully" : "Members checked out successfully";
  }

  async removeCheckout(memberId: string, checkInTime: string) {
    if (!memberId || !checkInTime) {
      throw new Error("Invalid Data: Member and check-in time required");
    }

    const result = await MembershipAttendance.updateOne(
      {
        memberId: new mongoose.Types.ObjectId(memberId),
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
      },
    );

    if (!result.modifiedCount) {
      throw new Error("Invalid Data: Checkout record not found");
    }

    return "Member checkout removed successfully";
  }

  async getAttendanceStatusList(query: any) {
    const { client, date } = query;
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    return MembershipAttendance.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
          attendacelist: { $elemMatch: { checkInTime: { $gte: startOfDay, $lte: endOfDay } } },
        },
      },
      { $unwind: "$attendacelist" },
      { $match: { "attendacelist.checkInTime": { $gte: startOfDay, $lte: endOfDay } } },
      {
        $project: {
          _id: 0,
          memberId: 1,
          checkInTime: "$attendacelist.checkInTime",
          checkOutTime: "$attendacelist.checkOutTime",
        },
      },
    ]);
  }

  async createType(createDto: any) {
    delete createDto._id;
    return MembershipType.create(createDto);
  }

  async findTypes(query: any) {
    const { client, search } = query;
    const filter: any = { ...activeRecordFilter };
    if (client) filter.client = { $regex: new RegExp(`^${client}$`, "i") };
    if (search) filter.membership_type = { $regex: search, $options: "i" };
    return MembershipType.find(filter).sort({ createdAt: -1 }).lean();
  }

  async updateType(id: string, updateDto: any) {
    delete updateDto._id;
    const previous = await MembershipType.findOne({ _id: id, ...activeRecordFilter }).lean();
    const result = await MembershipType.findOneAndUpdate({ _id: id, ...activeRecordFilter }, updateDto, { new: true }).lean();
    if (!result) throw new Error("MEMBERSHIP_TYPE.NOT_FOUND");
    await this.updatePendingFeesByType(result.client, result.membership_type);
    if (previous?.membership_type && previous.membership_type !== result.membership_type) {
      await this.updatePendingFeesByType(previous.client, previous.membership_type);
    }
    return result;
  }

  async changeTypeStatus(id: string) {
    const type = await MembershipType.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!type) throw new Error("MEMBERSHIP_TYPE.NOT_FOUND");
    return MembershipType.findOneAndUpdate({ _id: id, ...activeRecordFilter }, { status: type.status ? 0 : 1 }, { new: true }).lean();
  }

  async deleteType(id: string, payload: any = {}) {
    const result = await MembershipType.findOneAndUpdate(
      { _id: id, ...activeRecordFilter },
      { $set: getSoftDeleteUpdate(payload) },
      { new: true }
    ).lean();
    if (!result) throw new Error("MEMBERSHIP_TYPE.NOT_FOUND");
    return null;
  }
}
