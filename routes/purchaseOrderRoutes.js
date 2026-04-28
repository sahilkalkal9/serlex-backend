import express from "express";
import {
  createPurchaseOrder,
  getApprovedPurchaseOrders,
  getNewPurchaseOrders,
  getProcessingPurchaseOrders,
  getPurchaseDashboard,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createPurchaseOrder);
router.get("/dashboard", protect, getPurchaseDashboard);
router.get("/new-po", protect, getNewPurchaseOrders);
// controller import route me add
router.get("/processing", protect, getProcessingPurchaseOrders);
router.get("/approved", protect, getApprovedPurchaseOrders);

export default router;