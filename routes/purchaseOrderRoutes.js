import express from "express";
import {
  createPurchaseOrder,
  getApprovedPurchaseOrders,
  getNewPurchaseOrders,
  getProcessingPurchaseOrders,
  getPurchaseDashboard,
  getMyDailyActivityOrders,
  updateMyDailyActivityOrder,
  getPOTrackingOrders,
  updatePOTrackingOrder,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createPurchaseOrder);
router.get("/dashboard", protect, getPurchaseDashboard);
router.get("/new-po", protect, getNewPurchaseOrders);
router.get("/processing", protect, getProcessingPurchaseOrders);
router.get("/approved", protect, getApprovedPurchaseOrders);

router.get("/daily-activity", protect, getMyDailyActivityOrders);
router.patch("/daily-activity/:id", protect, updateMyDailyActivityOrder);
router.get("/tracking", protect, getPOTrackingOrders);
router.patch("/tracking/:id", protect, updatePOTrackingOrder);

export default router;