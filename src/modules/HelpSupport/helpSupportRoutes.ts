import express from "express";

import { ENUM_ROLE } from "../../enums/userEnums";
import { protect } from "../../middleware/auth";
import { authorize } from "../../middleware/authorize";
import {
  createHelpSupportRequest,
  createPublicHelpSupportRequest,
  getHelpSupportRequests,
  updateHelpSupportStatus,
} from "./helpSupportController";

const router = express.Router();

router.post("/public", createPublicHelpSupportRequest);
router.post("/", protect, createHelpSupportRequest);
router.get("/", protect, authorize(ENUM_ROLE.SUPERADMIN), getHelpSupportRequests);
router.patch(
  "/:id/status",
  protect,
  authorize(ENUM_ROLE.SUPERADMIN),
  updateHelpSupportStatus,
);

export default router;
