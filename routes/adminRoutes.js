import express from "express";
import {
  getAdminDashboard,
  getAdminMeetings,
  getAdminUsers,
} from "../controllers/adminDashboardController.js";
import { authorizeRoles, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", protect, authorizeRoles("admin"), getAdminDashboard);
router.get("/users", protect, authorizeRoles("admin"), getAdminUsers);
router.get("/meetings", protect, authorizeRoles("admin"), getAdminMeetings);

export default router;
