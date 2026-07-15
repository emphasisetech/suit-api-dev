import express from "express";
import { ENUM_ROLE } from "../../enums/userEnums";
import { protect } from "../../middleware/auth";
import { authorize } from "../../middleware/authorize";
import * as deletedItemsController from "./deletedItemsController";

const router = express.Router();

router.use(protect, authorize(ENUM_ROLE.SUPERADMIN));
router.get("/", deletedItemsController.findAll);
router.patch("/:id/restore", deletedItemsController.restore);
router.delete("/:id", deletedItemsController.permanentlyDelete);

export default router;
