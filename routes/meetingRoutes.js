import express from "express";
import {
  protect,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";

import {
  getMeetings,
  createMeeting,
  updateMeetingStatus,
  updateMeetingApprovalStatus,
  getSalesUsersMeetings,
  createMeetingForSalesUser,
  respondToMeetingInvite,
  getPurchaseMeetings,
  getPpcMeetings,
} from "../controllers/meetingController.js";

const router = express.Router();

const commonMeetingAccess = [
  "admin",
  "subadmin",
  "superadmin",
  "sales_user",
  "purchase_user",
  "ppc_user",
];

const managerAccess = ["admin", "subadmin", "superadmin"];

/**
 * Sales users meetings
 * Existing flow - do not break
 */
router.get(
  "/sales-users",
  protect,
  authorizeRoles(managerAccess),
  getSalesUsersMeetings
);

/**
 * Purchase meetings
 * New purchase manager planning flow
 * Shows meetings created by purchase_user + manager + invited meetings
 */
router.get(
  "/purchase",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin", "purchase_user"]),
  getPurchaseMeetings
);

/**
 * PPC meetings
 * Shows meetings created by PPC users + current user + invited meetings
 */
router.get(
  "/ppc",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin", "ppc_user"]),
  getPpcMeetings
);

/**
 * Current user's own meetings
 * Existing sales/ppc/user flow - do not break
 */
router.get("/", protect, getMeetings);

/**
 * Create meeting
 */
router.post(
  "/",
  protect,
  authorizeRoles(commonMeetingAccess),
  createMeeting
);

/**
 * Update meeting status
 * Used for completed/cancelled etc.
 */
router.patch(
  "/:id/status",
  protect,
  authorizeRoles(commonMeetingAccess),
  updateMeetingStatus
);

/**
 * Update meeting approval status
 */
router.patch(
  "/:id/approval",
  protect,
  authorizeRoles(commonMeetingAccess),
  updateMeetingApprovalStatus
);

/**
 * Create meeting for sales user
 * Existing flow - kept same
 */
router.post(
  "/sales-users",
  protect,
  authorizeRoles(commonMeetingAccess),
  createMeetingForSalesUser
);

/**
 * Respond to meeting invite
 * Approve/reject invite with rejection reason
 */
router.patch(
  "/:id/invite-response",
  protect,
  authorizeRoles(commonMeetingAccess),
  respondToMeetingInvite
);

export default router;
