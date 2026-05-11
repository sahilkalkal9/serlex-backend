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
import { getSalesTeamUsers } from "../controllers/authController.js";

const router = express.Router();

router.get(
  "/",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin"]),
  getSalesUsers
);

router.get(
  "/sales-team",
  protect,
  authorizeRoles(["admin", "subadmin", "superadmin", "sales_user"]),
  getSalesTeamUsers
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