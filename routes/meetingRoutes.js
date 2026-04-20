import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getMeetings,
  createMeeting,
  updateMeetingStatus,
} from "../controllers/meetingController.js";

const router = express.Router();

router.get("/", protect, getMeetings);
router.post("/", protect, createMeeting);
router.patch("/:id/status", protect, updateMeetingStatus);

export default router;