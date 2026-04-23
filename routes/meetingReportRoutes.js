import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  createMeetingReport,
  getMeetingReports,
  getEligibleMeetingsForReport,
} from "../controllers/meetingReportController.js";

const router = express.Router();

const allowMeetingReportWriteAccess = (req, res, next) => {
  if (["sales_user", "admin", "superadmin"].includes(req.user.role)) {
    return next();
  }

  if (req.user.role === "subadmin" && req.user.subRole === "sales_manager") {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Access denied: insufficient permissions",
  });
};

router.get("/", protect, getMeetingReports);
router.get("/eligible-meetings", protect, getEligibleMeetingsForReport);
router.post("/", protect, allowMeetingReportWriteAccess, createMeetingReport);

export default router;