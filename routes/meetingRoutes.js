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
} from "../controllers/meetingController.js";

const router = express.Router();

router.get(
  "/sales-users",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  getSalesUsersMeetings
);

router.get("/", protect, getMeetings);

router.post(
  "/",
  protect,
  authorizeRoles(["sales_user", "subadmin", "admin", "superadmin"]),
  createMeeting
);

router.patch(
  "/:id/status",
  protect,
  authorizeRoles(["sales_user", "subadmin", "admin", "superadmin"]),
  updateMeetingStatus
);

router.patch(
  "/:id/approval",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  updateMeetingApprovalStatus
);

router.post(
  "/sales-users",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  createMeetingForSalesUser
);

export default router;