import express from "express";
import * as employeeController from "./employeeController";

const router = express.Router();

router.post("/portal/request-otp", employeeController.requestPortalOtp);
router.post("/portal/verify-otp", employeeController.verifyPortalOtp);
router.post("/portal/staff-login", employeeController.loginStaffPortal);
router.get("/portal/teacher-classroom", employeeController.getTeacherClassroom);
router.get("/portal/accountant-workspace", employeeController.getAccountantWorkspace);
router.post("/portal/accountant-payment", employeeController.addAccountantStudentPayment);
router.post("/portal/accountant-attendance", employeeController.markAccountantStaffAttendance);
router.get("/portal/chat/contacts", employeeController.getPortalChatContacts);
router.get("/portal/chat/messages", employeeController.getPortalChatMessages);
router.post("/portal/chat/messages", employeeController.sendPortalChatMessage);
router.post("/portal/teacher-attendance", employeeController.markTeacherClassAttendance);
router.post("/portal/teacher-assignment", employeeController.createTeacherAssignment);
router.put("/portal/teacher-assignment/:assignmentId/results", employeeController.updateTeacherAssignmentResults);
router.put("/portal/teacher-assignment/:assignmentId", employeeController.updateTeacherAssignment);
router.get("/portal/data", employeeController.getPortalData);
router.post("/", employeeController.createEmployee);
router.get("/", employeeController.getEmployees);
router.put("/:id", employeeController.updateEmployee);
router.delete("/:id", employeeController.deleteEmployee);
router.post("/attendance", employeeController.markAttendance);
router.get("/attendance", employeeController.getAttendance);
router.patch("/attendance/:employeeId/remove-checkout", employeeController.removeAttendanceCheckout);
router.get("/salary-report", employeeController.getSalaryReport);

export default router;
