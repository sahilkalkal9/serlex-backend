import express from "express";
import {
  createVendor,
  getVendors,
} from "../controllers/vendorController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createVendor);
router.get("/", protect, getVendors);

export default router;