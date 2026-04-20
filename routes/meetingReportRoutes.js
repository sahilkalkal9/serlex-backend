import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  createMeetingReport,
  getMeetingReports,
  getEligibleMeetingsForReport,
} from "../controllers/meetingReportController.js";

const router = express.Router();

router.get("/", protect, getMeetingReports);
router.get("/eligible-meetings", protect, getEligibleMeetingsForReport);
router.post("/", protect, createMeetingReport);

export default router;