import express from "express";
import {
  redirectToGoogleAuth,
  googleCallback,
  getGoogleConnectionStatus,
} from "../controllers/googleController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/auth-url", protect, redirectToGoogleAuth);
router.get("/callback", googleCallback);
router.get("/status", protect, getGoogleConnectionStatus);

export default router;