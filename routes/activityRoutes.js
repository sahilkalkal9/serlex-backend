import express from "express";
import {
  logoutUser,
  getMyActivities,
  getAllActivities,
} from "../controllers/activityController.js";
import {
  protect,
  authorizeRoles,
  authorizeSubRoles,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/logout", protect, logoutUser);
router.get("/my-activities", protect, getMyActivities);

router.get(
  "/all",
  protect,
  (req, res, next) => {
    const allowedTopRoles = ["admin", "superadmin"];
    if (allowedTopRoles.includes(req.user.role)) {
      return next();
    }

    if (req.user.role === "subadmin" && req.user.subRole === "sales_manager") {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Access denied: insufficient permissions",
    });
  },
  getAllActivities
);

export default router;