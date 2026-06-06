import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  upsertManagerTarget,
  getManagerTarget,
  getAllManagerTargets,
  getMyManagerTarget,
  getManagerPos,
} from "../controllers/managerTargetController.js";

const router = express.Router();

router.post("/", protect, upsertManagerTarget);
router.put("/", protect, upsertManagerTarget);
router.get("/all", protect, getAllManagerTargets);
router.get("/my-target", protect, getMyManagerTarget);
router.get("/:managerId/pos", protect, getManagerPos);
router.get("/:managerId", protect, getManagerTarget);

export default router;
