import express from "express";
import {
  createPurchaseOrder,
  getPurchaseDashboard,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createPurchaseOrder);
router.get("/dashboard", protect, getPurchaseDashboard);

export default router;