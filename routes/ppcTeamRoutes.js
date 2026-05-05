import express from "express";
import {
  getPpcMembers,
  createPpcMember,
  updatePpcMember,
  deletePpcMember,
  getPpcTeamMeetings,
  updatePpcMeetingApproval,
  updatePpcMeetingStatus,
} from "../controllers/ppcTeamController.js";
import { protect, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/members", authorizeRoles("subadmin", "admin", "superadmin"), getPpcMembers);
router.post("/members", authorizeRoles("subadmin", "admin", "superadmin"), createPpcMember);
router.patch("/members/:id", authorizeRoles("subadmin", "admin", "superadmin"), updatePpcMember);
router.delete("/members/:id", authorizeRoles("subadmin", "admin", "superadmin"), deletePpcMember);

router.get("/meetings", authorizeRoles("subadmin", "admin", "superadmin"), getPpcTeamMeetings);
router.patch("/meetings/:id/approval", authorizeRoles("subadmin", "admin", "superadmin"), updatePpcMeetingApproval);
router.patch("/meetings/:id/status", authorizeRoles("subadmin", "admin", "superadmin"), updatePpcMeetingStatus);

export default router;