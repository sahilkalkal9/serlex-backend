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

router.get("/members", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), getPpcMembers);
router.post("/members", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), createPpcMember);
router.patch("/members/:id", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), updatePpcMember);
router.delete("/members/:id", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), deletePpcMember);

router.get("/meetings", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), getPpcTeamMeetings);
router.patch("/meetings/:id/approval", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), updatePpcMeetingApproval);
router.patch("/meetings/:id/status", authorizeRoles("subadmin", "admin", "superadmin", "radmin"), updatePpcMeetingStatus);

export default router;