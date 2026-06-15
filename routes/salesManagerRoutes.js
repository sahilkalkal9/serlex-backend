import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getAdminAttendanceReport,
  getAdminLoginLogoutReport,
  getAdminSimpleReport,
  getSalesManagerAllocatedUsers,
} from "../controllers/adminReportController.js";

const router = express.Router();

const salesManagerOnly = (req, res, next) => {
  const { role, subRole } = req.user;
  if (role === "admin" || role === "superadmin" || role === "radmin") return next();
  if (role === "subadmin" && subRole === "sales_manager") return next();
  return res.status(403).json({ success: false, message: "Access denied: sales manager only" });
};

const wrapWithSalesFilter = (handler) => async (req, res) => {
  // Now the filter logic is handled in buildSalesData based on user role
  // No need to modify req.query here anymore
  return handler(req, res);
};

router.get("/reports/attendance", protect, salesManagerOnly, wrapWithSalesFilter(getAdminAttendanceReport));
router.get("/reports/login-logout", protect, salesManagerOnly, wrapWithSalesFilter(getAdminLoginLogoutReport));
router.get("/reports/other", protect, salesManagerOnly, wrapWithSalesFilter(getAdminSimpleReport));
router.get("/allocated-users", protect, salesManagerOnly, getSalesManagerAllocatedUsers);

export default router;
