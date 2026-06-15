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
import {
  getSalesTeamUsers,
  getPurchaseTeamUsers,
  getPpcTeamUsers,
} from "../controllers/authController.js";

const router = express.Router();

router.get(
  "/",
  protect,
  authorizeRoles(["admin", "radmin", "subadmin", "superadmin"]),
  getSalesUsers
);

router.get(
  "/sales-team",
  protect,
  authorizeRoles([
    "admin",
    "radmin",
    "subadmin",
    "superadmin",
    "sales_user",
  ]),

  getSalesTeamUsers
);

router.get(
  "/purchase-team",
  protect,
  authorizeRoles([
    "admin",
    "radmin",
    "subadmin",
    "superadmin",
    "purchase_user",
  ]),

  getPurchaseTeamUsers
);

router.get(
  "/ppc-team",
  protect,
  authorizeRoles([
    "admin",
    "radmin",
    "subadmin",
    "superadmin",
    "ppc_user",
    "purchase_user",
  ]),
  getPpcTeamUsers
);

router.get(
  "/:id",
  protect,
  authorizeRoles(["admin", "radmin", "subadmin", "superadmin"]),
  getSalesUserById
);

router.put(
  "/:id",
  protect,
  authorizeRoles(["admin", "radmin", "subadmin", "superadmin"]),
  updateSalesUser
);

router.delete(
  "/:id",
  protect,
  authorizeRoles(["admin", "radmin", "subadmin", "superadmin"]),
  deleteSalesUser
);

export default router;