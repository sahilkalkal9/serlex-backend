import express from "express";
import {
  protect,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";

import {
  getPurchaseTeamMembers,
  createPurchaseTeamMember,
  updatePurchaseTeamMember,
  deletePurchaseTeamMember,
} from "../controllers/purchaseTeamController.js";

import {
  getPurchaseUsersMeetings,
  updatePurchaseMeetingApproval,
} from "../controllers/purchaseTeamMeetingController.js";

const router = express.Router();

const purchaseManagerAccess = ["admin", "subadmin", "superadmin"];

// Team members
router.get(
  "/members",
  protect,
  authorizeRoles(purchaseManagerAccess),
  getPurchaseTeamMembers
);

router.post(
  "/members",
  protect,
  authorizeRoles(purchaseManagerAccess),
  createPurchaseTeamMember
);

router.patch(
  "/members/:id",
  protect,
  authorizeRoles(purchaseManagerAccess),
  updatePurchaseTeamMember
);

router.delete(
  "/members/:id",
  protect,
  authorizeRoles(purchaseManagerAccess),
  deletePurchaseTeamMember
);

// Purchase users meetings
router.get(
  "/meetings",
  protect,
  authorizeRoles(purchaseManagerAccess),
  getPurchaseUsersMeetings
);

router.patch(
  "/meetings/:id/approval",
  protect,
  authorizeRoles(purchaseManagerAccess),
  updatePurchaseMeetingApproval
);

export default router;  