import { Request, Response } from "express";
import { MembershipService } from "./membershipService";
import { responseService } from "../../utils/response.util";

const membershipService = new MembershipService();

const ok = (res: Response, data: any, message: string, status = 200) =>
  responseService.successResponse(data, message, res, status);

export const createMember = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.create(req.body), "MEMBER_CREATED", 201);
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMembers = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.findAll(req.query), "MEMBERS_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMemberById = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.findById(req.params.id as string), "MEMBER_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const updateMember = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.update(req.params.id as string, req.body), "MEMBER_UPDATED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const changeMemberStatus = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.changeStatus(req.params.id as string), "MEMBER_STATUS_CHANGED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const deleteMember = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.delete(req.params.id as string, (req as any).user || {}), "MEMBER_DELETED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const calculateMemberPendingFee = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.calculatePendingFee(req.params.id as string), "MEMBER_PENDING_FEE_CALCULATED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const addMembershipPayment = async (req: Request, res: Response) => {
  try {
    const { member_id, ...paymentDto } = req.body;
    return ok(res, await membershipService.addPayment(member_id, paymentDto), "MEMBERSHIP_PAYMENT_CREATED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMembershipPayments = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.findAllPayments(req.query), "MEMBERSHIP_PAYMENTS_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMembershipPaymentReceipt = async (req: Request, res: Response) => {
  try {
    return ok(
      res,
      await membershipService.getPaymentReceipt(req.params.paymentId as string),
      "MEMBERSHIP_PAYMENT_RECEIPT_RETRIEVED",
    );
  } catch (error: any) {
    if (error.message === "PAYMENTS.NOT_FOUND") {
      return responseService.notFoundResponse("Payment not found", res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const getMembershipAttendance = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.getAttendance(req.params.memberId as string), "MEMBERSHIP_ATTENDANCE_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMembersForCheckInCheckOut = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.getMembersForCheckInCheckOut(req.query), "MEMBERSHIP_ATTENDANCE_LIST_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const markMembershipAttendance = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.markAttendance(req.body), "MEMBERSHIP_ATTENDANCE_MARKED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const removeMembershipCheckout = async (req: Request, res: Response) => {
  try {
    return ok(
      res,
      await membershipService.removeCheckout(
        req.params.memberId as string,
        req.body.checkInTime,
      ),
      "MEMBERSHIP_CHECKOUT_REMOVED",
    );
  } catch (error: any) {
    if (error.message.includes("Invalid Data")) {
      return responseService.InvalidDataResponse(error.message, res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const getMembershipAttendanceStatusList = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.getAttendanceStatusList(req.query), "MEMBERSHIP_ATTENDANCE_STATUS_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const createMembershipType = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.createType(req.body), "MEMBERSHIP_TYPE_CREATED", 201);
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getMembershipTypes = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.findTypes(req.query), "MEMBERSHIP_TYPES_RETRIEVED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const updateMembershipType = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.updateType(req.params.id as string, req.body), "MEMBERSHIP_TYPE_UPDATED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const changeMembershipTypeStatus = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.changeTypeStatus(req.params.id as string), "MEMBERSHIP_TYPE_STATUS_CHANGED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const deleteMembershipType = async (req: Request, res: Response) => {
  try {
    return ok(res, await membershipService.deleteType(req.params.id as string, (req as any).user || {}), "MEMBERSHIP_TYPE_DELETED");
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};
