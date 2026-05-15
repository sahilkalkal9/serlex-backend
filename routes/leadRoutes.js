import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getSalesManagerLeads } from "../controllers/leadController.js";

const router = express.Router();

router.get("/sales-manager", protect, getSalesManagerLeads);

export default router;
