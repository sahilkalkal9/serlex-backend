import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  createMeetingReport,
  getMeetingReports,
  getMeetingReportByMeetingId,
  getReportsByLeadId,
  getEligibleMeetingsForReport,
  getLeadIds,
  updateMeetingReport,
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
router.get("/by-meeting/:meetingId", protect, getMeetingReportByMeetingId);
router.get("/by-lead/:leadId", protect, getReportsByLeadId);
router.get("/eligible-meetings", protect, getEligibleMeetingsForReport);
router.get("/lead-ids", protect, getLeadIds);

router.post("/", protect, allowMeetingReportWriteAccess, createMeetingReport);

router.put(
  "/:id",
  protect,
  allowMeetingReportWriteAccess,
  updateMeetingReport
);

export default router;