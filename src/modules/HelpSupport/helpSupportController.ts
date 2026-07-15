import { Request, Response } from "express";

import { AuthRequest } from "../../middleware/auth";
import { responseService } from "../../utils/response.util";
import HelpSupport, {
  HelpSupportStatus,
  HelpSupportType,
} from "./model/HelpSupport";

const validateRequest = (req: Request, res: Response) => {
  const type = String(req.body.type || "").trim();
  const subject = String(req.body.subject || "").trim();
  const description = String(req.body.description || "").trim();

  if (!Object.values(HelpSupportType).includes(type as HelpSupportType)) {
    responseService.InvalidDataResponse("Please select a valid request type", res);
    return null;
  }
  if (!subject) {
    responseService.InvalidDataResponse("Subject is required", res);
    return null;
  }
  if (!description) {
    responseService.InvalidDataResponse("Description is required", res);
    return null;
  }

  return { type, subject, description };
};

export const createPublicHelpSupportRequest = async (
  req: Request,
  res: Response,
) => {
  try {
    const values = validateRequest(req, res);
    if (!values) return;

    const request = await HelpSupport.create({
      ...values,
      submitted_by: "guest",
    });
    return responseService.successResponse(
      request,
      "Your support request has been submitted successfully",
      res,
      201,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const createHelpSupportRequest = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const values = validateRequest(req, res);
    if (!values) return;

    const user = req.user || {};
    const request = await HelpSupport.create({
      ...values,
      submitted_by: "user",
      user_id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      user_role: user.userRole,
      client: String(req.query.client || req.body.client || "").trim(),
    });
    return responseService.successResponse(
      request,
      "Your support request has been submitted successfully",
      res,
      201,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const getHelpSupportRequests = async (_req: Request, res: Response) => {
  try {
    const requests = await HelpSupport.find().sort({ createdAt: -1 });
    return responseService.successResponse(
      requests,
      "Support requests retrieved successfully",
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const updateHelpSupportStatus = async (req: Request, res: Response) => {
  try {
    const status = String(req.body.status || "");
    if (!Object.values(HelpSupportStatus).includes(status as HelpSupportStatus)) {
      return responseService.InvalidDataResponse("Invalid support status", res);
    }

    const request = await HelpSupport.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!request) {
      return responseService.notFoundResponse("Support request not found", res);
    }
    return responseService.successResponse(
      request,
      "Support request status updated successfully",
      res,
    );
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};
