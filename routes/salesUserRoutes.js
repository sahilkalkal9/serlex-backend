import express from "express";
import {
  protect,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";
import {
  getSalesUsers,
  getSalesUserById,
  updateSalesUser,
  deleteSalesUser,
} from "../controllers/salesUserController.js";

const router = express.Router();

router.get(
  "/",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  getSalesUsers
);

router.get(
  "/:id",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  getSalesUserById
);

router.put(
  "/:id",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  updateSalesUser
);

router.delete(
  "/:id",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  deleteSalesUser
);

export default router;