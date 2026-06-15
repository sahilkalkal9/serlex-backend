import express from "express";
import {
  clearUserDevice,
  getAdminDashboard,
  getAdminMeetings,
  getAdminUsers,
  createAdminUser,
  updateAdminUserStatus,
  approveAdminUser,
  getAdminHierarchy,
  updateUserWorkingHours,
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

import { authorizeRoles, protect, authorizeAdminPanel } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", protect, authorizeAdminPanel, getAdminDashboard);

// Users
router.get("/users", protect, authorizeAdminPanel, getAdminUsers);
router.post("/users", protect, authorizeAdminPanel, createAdminUser);
router.patch(
  "/users/:id/status",
  protect,
  authorizeAdminPanel,
  updateAdminUserStatus
);
router.patch(
  "/users/:id/approve",
  protect,
  authorizeAdminPanel,
  approveAdminUser
);

router.patch(
  "/users/:id/working-hours",
  protect,
  authorizeAdminPanel,
  updateUserWorkingHours
);
router.patch(
  "/users/:id/clear-device",
  protect,
  authorizeAdminPanel,
  clearUserDevice
);

// Hierarchy tree
router.get(
  "/hierarchy",
  protect,
  authorizeAdminPanel,
  getAdminHierarchy
);

// Meetings
router.get("/meetings", protect, authorizeAdminPanel, getAdminMeetings);

// Reports
router.get(
  "/reports/overview",
  protect,
  authorizeAdminPanel,
  getAdminReportsOverview
);
router.get("/reports/sales", protect, authorizeAdminPanel, getAdminSalesReport);
router.get("/reports/po", protect, authorizeAdminPanel, getAdminPoReport);
router.get(
  "/reports/attendance",
  protect,
  authorizeAdminPanel,
  getAdminAttendanceReport
);
router.get(
  "/reports/target-achievement",
  protect,
  authorizeAdminPanel,
  getAdminTargetAchievementReport
);
router.get(
  "/reports/login-logout",
  protect,
  authorizeAdminPanel,
  getAdminLoginLogoutReport
);
router.get(
  "/reports/meetings",
  protect,
  authorizeAdminPanel,
  getAdminMeetingAnalyticsReport
);
router.get("/reports/:type", protect, authorizeAdminPanel, getAdminSimpleReport);

export default router;