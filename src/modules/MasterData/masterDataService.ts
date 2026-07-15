import Student from "../Student/model/Student";
import Employee from "../Employee/model/Employee";
import MembershipType from "../Membership/model/MembershipType";


export class MasterDataService {
  private uniqueValues(values: unknown[]) {
    const seen = new Set<string>();

    return values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  async getPaymentMethods(client: string) {
    const result = await Student.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
        },
      },
      { $unwind: "$courses" },
      { $unwind: "$courses.payments" },
      {
        $match: {
          "courses.payments.payment_mode": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$courses.payments.payment_mode",
        },
      },
      {
        $project: {
          _id: 0,
          payment_mode: "$_id",
        },
      },
    ]);

    return this.uniqueValues(result.map((item) => item.payment_mode));
  }

  async getCourse(client: string) {
    const result = await Student.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
        },
      },
      { $unwind: "$courses" },
      {
        $group: {
          _id: "$courses.course_name",
        },
      },
      {
        $project: {
          _id: 0,
          course: "$_id",
        },
      },
    ]);

    return this.uniqueValues(result.map((item) => item.course));
  }

  async getCustomFieldsForStudent(client: string) {
    const result = await Student.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
        },
      },
      { $unwind: "$custom_field" },
      {
        $group: {
          _id: "$custom_field.label",
        },
      },
      {
        $project: {
          _id: 0,
          label: "$_id",
          value: "$_id",
        },
      },
    ]);

    return this.uniqueValues(result.map((item) => item.label));
  }

  async getBatches(client: string) {
    const result = await Student.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
          class_batch: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$class_batch",
        },
      },
      {
        $project: {
          _id: 0,
          batch: "$_id",
        },
      },
      { $sort: { batch: 1 } },
    ]);
    return this.uniqueValues(result.map((item) => item.batch));
  }

  async getEmployeeMasterData(client: string, fieldName: string) {
    const result = await Employee.aggregate([
      {
        $match: {
          client: { $regex: new RegExp(`^${client}$`, "i") },
          [fieldName]: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: { $toUpper: `$${fieldName}` },
        },
      },
      {
        $project: {
          _id: 0,
          value: "$_id",
        },
      },
      { $sort: { value: 1 } },
    ]);

    return this.uniqueValues(result.map((item) => item.value));
  }

  async getMembershipTypes(client: string) {
    const result = await MembershipType.find(
      {
        client: { $regex: new RegExp(`^${client}$`, "i") },
        status: 1,
      },
      { membership_type: 1, _id: 0 },
    )
      .sort({ membership_type: 1 })
      .lean();

    return this.uniqueValues(result.map((item) => item.membership_type));
  }
}

