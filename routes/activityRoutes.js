import express from "express";
import {
  logoutUser,
  getMyActivities,
} from "../controllers/activityController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/logout", protect, logoutUser);
router.get("/my-activities", protect, getMyActivities);

export default router;