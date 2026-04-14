import express from "express";
import {
  logoutUser,
  getMyActivities,
  getAllActivities,
} from "../controllers/activityController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/logout", protect, logoutUser);
router.get("/my-activities", protect, getMyActivities);
router.get("/all", getAllActivities);

export default router;