import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  allocateUserToManager,
  deallocateUserFromManager,
  getAllocationsForManager,
  getAllocationStatusForUser,
  getManagersWithAllocations,
  bulkAllocateUsers,
  getUnallocatedSalesUsers,
} from "../controllers/userAllocationController.js";

const router = express.Router();

// Admin routes
router.post("/allocate", protect, allocateUserToManager);
router.post("/bulk-allocate", protect, bulkAllocateUsers);
router.put("/:allocationId/deallocate", protect, deallocateUserFromManager);
router.get("/manager/:managerId", protect, getAllocationsForManager);
router.get("/managers/with-allocations", protect, getManagersWithAllocations);
router.get("/unallocated", protect, getUnallocatedSalesUsers);

// Public routes (users can check their allocation status)
router.get("/user/:userId", getAllocationStatusForUser);

export default router;
