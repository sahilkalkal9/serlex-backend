import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getSalesTargetAchievementReport,
  getSalesTargetPODetails,
  upsertSalesTarget,
} from "../controllers/salesTargetController.js";

const router = express.Router();

router.get("/report", protect, getSalesTargetAchievementReport);
router.get("/po-details/:salesUserId", protect, getSalesTargetPODetails);
router.post("/", protect, upsertSalesTarget);
router.put("/", protect, upsertSalesTarget);

export default router;