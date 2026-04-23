import express from "express";
import {
  protect,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";
import {
  getMeetings,
  createMeeting,
  updateMeetingStatus,
} from "../controllers/meetingController.js";

const router = express.Router();

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

export default router;