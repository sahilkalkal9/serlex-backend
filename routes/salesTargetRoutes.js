import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getSalesTargetAchievementReport,
  getSalesTargetPODetails,
  upsertSalesTarget,
  getMySalesTargetReport,
  getMySalesTargetPODetails,
} from "../controllers/salesTargetController.js";

const router = express.Router();

router.get("/report", protect, getSalesTargetAchievementReport);
router.get("/po-details/:salesUserId", protect, getSalesTargetPODetails);
router.post("/", protect, upsertSalesTarget);
router.put("/", protect, upsertSalesTarget);
router.get("/my-report", protect, getMySalesTargetReport);
router.get("/my-po-details", protect, getMySalesTargetPODetails);

export default router;