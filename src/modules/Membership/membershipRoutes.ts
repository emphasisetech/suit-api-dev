import express from "express";
import {
  addMembershipPayment,
  calculateMemberPendingFee,
  changeMemberStatus,
  changeMembershipTypeStatus,
  createMember,
  createMembershipType,
  deleteMember,
  deleteMembershipType,
  getMemberById,
  getMembers,
  getMembersForCheckInCheckOut,
  getMembershipAttendance,
  getMembershipAttendanceStatusList,
  getMembershipPaymentReceipt,
  getMembershipPayments,
  getMembershipTypes,
  markMembershipAttendance,
  removeMembershipCheckout,
  updateMember,
  updateMembershipType,
} from "./membershipController";

const router = express.Router();

router.get("/payments", getMembershipPayments);
router.post("/payments", addMembershipPayment);
router.get("/payment-receipt/:paymentId", getMembershipPaymentReceipt);
router.get("/attendance/member/:memberId", getMembershipAttendance);
router.get("/attendance/check-in-out-list", getMembersForCheckInCheckOut);
router.post("/attendance/mark-attendance", markMembershipAttendance);
router.patch("/attendance/member/:memberId/remove-checkout", removeMembershipCheckout);
router.get("/attendance/status-list", getMembershipAttendanceStatusList);
router.post("/types", createMembershipType);
router.get("/types", getMembershipTypes);
router.patch("/types/:id", updateMembershipType);
router.patch("/types/status/:id", changeMembershipTypeStatus);
router.delete("/types/:id", deleteMembershipType);
router.post("/", createMember);
router.get("/", getMembers);
router.get("/:id", getMemberById);
router.post("/:id/calculate-pending-fee", calculateMemberPendingFee);
router.patch("/:id", updateMember);
router.patch("/status/:id", changeMemberStatus);
router.delete("/:id", deleteMember);

export default router;
