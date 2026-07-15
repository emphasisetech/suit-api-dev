import { Request, Response } from "express";
import { responseService } from "../../utils/response.util";
import { DeletedItemsService } from "./deletedItemsService";

const deletedItemsService = new DeletedItemsService();

export const findAll = async (_req: Request, res: Response) => {
  try {
    const result = await deletedItemsService.findAll();
    return responseService.successResponse(result, "Deleted items retrieved successfully", res);
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const restore = async (req: Request, res: Response) => {
  try {
    const result = await deletedItemsService.restore(
      req.body?.type,
      req.params.id as string
    );
    return responseService.successResponse(result, "Deleted item restored successfully", res);
  } catch (error: any) {
    if (error.message === "DELETED_ITEM_NOT_FOUND") {
      return responseService.notFoundResponse("Deleted item not found", res);
    }
    if (error.message === "INVALID_DELETED_ITEM_TYPE") {
      return responseService.InvalidDataResponse("Invalid deleted item type", res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const permanentlyDelete = async (req: Request, res: Response) => {
  try {
    const result = await deletedItemsService.permanentlyDelete(
      req.body?.type || req.query?.type,
      req.params.id as string
    );
    return responseService.successResponse(result, "Deleted item permanently deleted", res);
  } catch (error: any) {
    if (error.message === "DELETED_ITEM_NOT_FOUND") {
      return responseService.notFoundResponse("Deleted item not found", res);
    }
    if (error.message === "INVALID_DELETED_ITEM_TYPE") {
      return responseService.InvalidDataResponse("Invalid deleted item type", res);
    }
    return responseService.errorResponse(error, res);
  }
};
