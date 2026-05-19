import express from "express";
import {
  getAdminDashboard,
  getAdminMeetings,
  getAdminUsers,
  createAdminUser,
  updateAdminUserStatus,
  approveAdminUser,
  getAdminHierarchy,
} from "../controllers/adminDashboardController.js";

import {
  getAdminAttendanceReport,
  getAdminLoginLogoutReport,
  getAdminMeetingAnalyticsReport,
  getAdminPoReport,
  getAdminReportsOverview,
  getAdminSalesReport,
  getAdminSimpleReport,
  getAdminTargetAchievementReport,
} from "../controllers/adminReportController.js";

import { authorizeRoles, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", protect, authorizeRoles("admin"), getAdminDashboard);

// Users
router.get("/users", protect, authorizeRoles("admin"), getAdminUsers);
router.post("/users", protect, authorizeRoles("admin"), createAdminUser);
router.patch(
  "/users/:id/status",
  protect,
  authorizeRoles("admin"),
  updateAdminUserStatus
);
router.patch(
  "/users/:id/approve",
  protect,
  authorizeRoles("admin"),
  approveAdminUser
);

// Hierarchy tree
router.get(
  "/hierarchy",
  protect,
  authorizeRoles("admin"),
  getAdminHierarchy
);

// Meetings
router.get("/meetings", protect, authorizeRoles("admin"), getAdminMeetings);

// Reports
router.get(
  "/reports/overview",
  protect,
  authorizeRoles("admin"),
  getAdminReportsOverview
);
router.get("/reports/sales", protect, authorizeRoles("admin"), getAdminSalesReport);
router.get("/reports/po", protect, authorizeRoles("admin"), getAdminPoReport);
router.get(
  "/reports/attendance",
  protect,
  authorizeRoles("admin"),
  getAdminAttendanceReport
);
router.get(
  "/reports/target-achievement",
  protect,
  authorizeRoles("admin"),
  getAdminTargetAchievementReport
);
router.get(
  "/reports/login-logout",
  protect,
  authorizeRoles("admin"),
  getAdminLoginLogoutReport
);
router.get(
  "/reports/meetings",
  protect,
  authorizeRoles("admin"),
  getAdminMeetingAnalyticsReport
);
router.get("/reports/:type", protect, authorizeRoles("admin"), getAdminSimpleReport);

export default router;