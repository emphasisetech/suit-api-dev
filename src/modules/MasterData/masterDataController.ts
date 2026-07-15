import { Request, Response } from "express";
import { MasterDataService } from "./masterDataService";
import { responseService } from "../../utils/response.util";
import { MESSAGES } from "../../constants/messages";

const masterDataService = new MasterDataService();

// Stub to fix build error
export const findAll = async (req: Request, res: Response) => {
  // console.log("Finding all master data", req.query, req.body);
  const { client, field_name } = req.query as any;

  let result: any[] = [];
  switch (field_name) {
    case "payment_methods":
      result = await masterDataService.getPaymentMethods(client);
      return responseService.successResponse(
        result,
        MESSAGES.MASTERS_DATA.RETRIEVED,
        res,
      );
    case "courses":
      result = await masterDataService.getCourse(client);
      return responseService.successResponse(
        result,
        MESSAGES.MASTERS_DATA.RETRIEVED,
        res,
      );
    case "custom_fields_for_student":
      result = await masterDataService.getCustomFieldsForStudent(client);
      return responseService.successResponse(
        result,
        MESSAGES.MASTERS_DATA.RETRIEVED,
        res,
      );
    case "batches":
      result = await masterDataService.getBatches(client);
      return responseService.successResponse(
        result,
        MESSAGES.MASTERS_DATA.RETRIEVED,
        res,
      );
    case "membership_types":
      result = await masterDataService.getMembershipTypes(client);
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
    case "employee_designations":
      result = await masterDataService.getEmployeeMasterData(client, "designation");
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
    case "employee_bank_names":
      result = await masterDataService.getEmployeeMasterData(client, "bank_name");
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
    case "employee_branch_names":
      result = await masterDataService.getEmployeeMasterData(client, "branch_name");
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
    case "employee_qualifications":
      result = await masterDataService.getEmployeeMasterData(client, "qualification");
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
    case "employee_departments":
      result = await masterDataService.getEmployeeMasterData(client, "department");
      return responseService.successResponse(result, MESSAGES.MASTERS_DATA.RETRIEVED, res);
  }

  return responseService.successResponse(
    result,
    MESSAGES.MASTERS_DATA.RETRIEVED,
    res,
  );
};
