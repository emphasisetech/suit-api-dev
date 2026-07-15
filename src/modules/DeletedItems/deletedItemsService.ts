import User from "../User/model/User";
import Student from "../Student/model/Student";
import Employee from "../Employee/model/Employee";
import Membership from "../Membership/model/Membership";
import MembershipType from "../Membership/model/MembershipType";
import ImportedSheetUsers from "../ImportedSheetUsers/model/ImportedSheetUsers";
import Newsletter from "../Inquiry/model/Newsletter";
import CourseMaster from "../CourseMaster/model/CourseMaster";
import Account from "../Account/model/Account";

const deletedFilter = { deleted: true };

const sortDeleted = (items: any[]) =>
  items.sort((a, b) => {
    const left = new Date(a.deleted_at || 0).getTime();
    const right = new Date(b.deleted_at || 0).getTime();
    return right - left;
  });

const mapItem = (type: string, item: any, title: string, client = "") => ({
  id: String(item._id),
  type,
  title,
  client,
  deleted_at: item.deleted_at || null,
  deleted_by: item.deleted_by || {},
  createdAt: item.createdAt || null,
});

const restoreUpdate = {
  deleted: false,
  deleted_at: null,
  deleted_by: {
    user_id: null,
    username: "",
    name: "",
    role: "",
  },
};

export class DeletedItemsService {
  async findAll() {
    const [
      users,
      students,
      employees,
      members,
      membershipTypes,
      importedSheets,
      newsletters,
      courseMasters,
      accountsWithDeletedOutlets,
    ] = await Promise.all([
      User.find(deletedFilter).select("name username email clients userRole deleted_at deleted_by createdAt").lean(),
      Student.find({
        $or: [
          deletedFilter,
          { "courses.deleted": true },
          { "courses.payments.deleted": true },
        ],
      }).select("name student_key email client deleted deleted_at deleted_by createdAt courses").lean(),
      Employee.find(deletedFilter).select("name email client deleted_at deleted_by createdAt").lean(),
      Membership.find(deletedFilter).select("name phone_number client membership_type deleted_at deleted_by createdAt").lean(),
      MembershipType.find(deletedFilter).select("membership_type client deleted_at deleted_by createdAt").lean(),
      ImportedSheetUsers.find(deletedFilter).select("file_name username client deleted_at deleted_by createdAt").lean(),
      Newsletter.find(deletedFilter).select("email deleted_at deleted_by createdAt").lean(),
      CourseMaster.find({ "courses.deleted": true }).select("client courses").lean(),
      Account.find({ "outlets.deleted": true }).select("account_name account_key outlets").lean(),
    ]);

    const courseItems = courseMasters.flatMap((master: any) =>
      (master.courses || [])
        .filter((course: any) => course.deleted === true)
        .map((course: any) =>
          mapItem("Course Master", course, course.course_name || "Course", master.client)
        )
    );

    const outletItems = accountsWithDeletedOutlets.flatMap((account: any) =>
      (account.outlets || [])
        .filter((outlet: any) => outlet.deleted === true)
        .map((outlet: any) =>
          mapItem(
            "Outlet",
            outlet,
            outlet.outlet_name || outlet.outlet_key || "Outlet",
            account.account_name || account.account_key || ""
          )
        )
    );

    const studentCourseItems = students.flatMap((student: any) =>
      (student.courses || [])
        .filter((course: any) => course.deleted === true)
        .map((course: any) =>
          mapItem(
            "Student Course",
            course,
            `${student.name || "Student"} - ${course.course_name || "Course"}`,
            student.client
          )
        )
    );

    const studentPaymentItems = students.flatMap((student: any) =>
      (student.courses || []).flatMap((course: any) =>
        (course.payments || [])
          .filter((payment: any) => payment.deleted === true)
          .map((payment: any) =>
            mapItem(
              "Student Payment",
              payment,
              `${student.name || "Student"} - ${payment.slip_number || course.course_name || "Payment"}`,
              student.client
            )
          )
      )
    );

    return sortDeleted([
      ...users.map((item: any) =>
        mapItem("User", item, item.name || item.username || "User", item.clients?.[0]?.account_name || "")
      ),
      ...students
        .filter((item: any) => item.deleted === true)
        .map((item: any) =>
          mapItem("Student", item, item.name || item.student_key || "Student", item.client)
        ),
      ...employees.map((item: any) =>
        mapItem("Employee", item, item.name || item.email || "Employee", item.client)
      ),
      ...members.map((item: any) =>
        mapItem("Membership", item, item.name || item.phone_number || "Member", item.client)
      ),
      ...membershipTypes.map((item: any) =>
        mapItem("Membership Type", item, item.membership_type || "Membership Type", item.client)
      ),
      ...importedSheets.map((item: any) =>
        mapItem("Imported Sheet", item, item.file_name || "Imported Sheet", item.client)
      ),
      ...newsletters.map((item: any) =>
        mapItem("Newsletter", item, item.email || "Newsletter", "")
      ),
      ...courseItems,
      ...outletItems,
      ...studentCourseItems,
      ...studentPaymentItems,
    ]);
  }

  async restore(type: string, id: string) {
    const normalizedType = String(type || "").trim().toLowerCase();

    const restoreTopLevel = async (model: any, notFoundMessage: string) => {
      const result = await model.findOneAndUpdate(
        { _id: id, deleted: true },
        { $set: restoreUpdate },
        { new: true }
      );
      if (!result) throw new Error(notFoundMessage);
      return result;
    };

    switch (normalizedType) {
      case "user":
        return restoreTopLevel(User, "DELETED_ITEM_NOT_FOUND");
      case "student":
        return restoreTopLevel(Student, "DELETED_ITEM_NOT_FOUND");
      case "employee":
        return restoreTopLevel(Employee, "DELETED_ITEM_NOT_FOUND");
      case "membership":
        return restoreTopLevel(Membership, "DELETED_ITEM_NOT_FOUND");
      case "membership type":
        return restoreTopLevel(MembershipType, "DELETED_ITEM_NOT_FOUND");
      case "imported sheet":
        return restoreTopLevel(ImportedSheetUsers, "DELETED_ITEM_NOT_FOUND");
      case "newsletter":
        return restoreTopLevel(Newsletter, "DELETED_ITEM_NOT_FOUND");
      case "course master": {
        const result = await CourseMaster.findOneAndUpdate(
          { "courses._id": id, "courses.deleted": true },
          {
            $set: {
              "courses.$.deleted": false,
              "courses.$.deleted_at": null,
              "courses.$.deleted_by": restoreUpdate.deleted_by,
            },
          },
          { new: true }
        );
        if (!result) throw new Error("DELETED_ITEM_NOT_FOUND");
        return result;
      }
      case "outlet": {
        const result = await Account.findOneAndUpdate(
          { "outlets._id": id, "outlets.deleted": true },
          {
            $set: {
              "outlets.$.deleted": false,
              "outlets.$.deleted_at": null,
              "outlets.$.deleted_by": restoreUpdate.deleted_by,
            },
          },
          { new: true }
        );
        if (!result) throw new Error("DELETED_ITEM_NOT_FOUND");
        return result;
      }
      case "student course": {
        const result = await Student.findOneAndUpdate(
          { "courses._id": id, "courses.deleted": true },
          {
            $set: {
              "courses.$.deleted": false,
              "courses.$.deleted_at": null,
              "courses.$.deleted_by": restoreUpdate.deleted_by,
            },
          },
          { new: true }
        );
        if (!result) throw new Error("DELETED_ITEM_NOT_FOUND");
        return result;
      }
      case "student payment": {
        const result = await Student.findOneAndUpdate(
          { "courses.payments._id": id, "courses.payments.deleted": true },
          {
            $set: {
              "courses.$[course].payments.$[payment].deleted": false,
              "courses.$[course].payments.$[payment].deleted_at": null,
              "courses.$[course].payments.$[payment].deleted_by": restoreUpdate.deleted_by,
            },
          },
          {
            new: true,
            arrayFilters: [
              { "course.payments._id": id },
              { "payment._id": id, "payment.deleted": true },
            ],
          }
        );
        if (!result) throw new Error("DELETED_ITEM_NOT_FOUND");
        return result;
      }
      default:
        throw new Error("INVALID_DELETED_ITEM_TYPE");
    }
  }

  async permanentlyDelete(type: string, id: string) {
    const normalizedType = String(type || "").trim().toLowerCase();

    const deleteTopLevel = async (model: any) => {
      const result = await model.deleteOne({ _id: id, deleted: true });
      if (!result.deletedCount) throw new Error("DELETED_ITEM_NOT_FOUND");
      return null;
    };

    switch (normalizedType) {
      case "user":
        return deleteTopLevel(User);
      case "student":
        return deleteTopLevel(Student);
      case "employee":
        return deleteTopLevel(Employee);
      case "membership":
        return deleteTopLevel(Membership);
      case "membership type":
        return deleteTopLevel(MembershipType);
      case "imported sheet":
        return deleteTopLevel(ImportedSheetUsers);
      case "newsletter":
        return deleteTopLevel(Newsletter);
      case "course master": {
        const result = await CourseMaster.updateOne(
          { "courses._id": id, "courses.deleted": true },
          { $pull: { courses: { _id: id, deleted: true } } }
        );
        if (!result.modifiedCount) throw new Error("DELETED_ITEM_NOT_FOUND");
        return null;
      }
      case "outlet": {
        const result = await Account.updateOne(
          { "outlets._id": id, "outlets.deleted": true },
          { $pull: { outlets: { _id: id, deleted: true } } }
        );
        if (!result.modifiedCount) throw new Error("DELETED_ITEM_NOT_FOUND");
        return null;
      }
      case "student course": {
        const result = await Student.updateOne(
          { "courses._id": id, "courses.deleted": true },
          { $pull: { courses: { _id: id, deleted: true } } }
        );
        if (!result.modifiedCount) throw new Error("DELETED_ITEM_NOT_FOUND");
        return null;
      }
      case "student payment": {
        const result = await Student.updateOne(
          { "courses.payments._id": id, "courses.payments.deleted": true },
          { $pull: { "courses.$[].payments": { _id: id, deleted: true } } }
        );
        if (!result.modifiedCount) throw new Error("DELETED_ITEM_NOT_FOUND");
        return null;
      }
      default:
        throw new Error("INVALID_DELETED_ITEM_TYPE");
    }
  }
}
