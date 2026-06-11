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
  getPurchasePlanningTrackingOrders,
  updatePurchasePlanningApproval,
  updatePOActionStatus,
  getSalesManagerPOTrackingOrders,
  getPpcTrackingOrders,
  getPpcPlanningTrackingOrders,
  updatePpcPlanningApproval,
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

router.get("/planning-tracking", protect, getPurchasePlanningTrackingOrders);
router.patch("/planning-tracking/:id", protect, updatePurchasePlanningApproval);
router.patch("/approved/:id/action", protect, updatePOActionStatus);
router.get("/sales-manager-tracking", protect, getSalesManagerPOTrackingOrders);
router.get("/ppc-tracking", protect, getPpcTrackingOrders);
router.get("/ppc-planning-tracking", protect, getPpcPlanningTrackingOrders);
router.patch("/ppc-planning-tracking/:id", protect, updatePpcPlanningApproval);

export default router;