import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";
import SalesTarget from "../models/SalesTarget.js";

const isAdmin = (user) => {
  return ["admin", "superadmin"].includes(user?.role);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

// Allocate a sales user to a sales manager
export const allocateUserToManager = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only admin can allocate users to managers",
      });
    }

    const { salesUserId, salesManagerId, remarks = "" } = req.body;

    if (!salesUserId || !salesManagerId) {
      return res.status(400).json({
        success: false,
        message: "Sales user ID and sales manager ID are required",
      });
    }

    // Verify sales user exists
    const salesUser = await User.findOne({
      _id: salesUserId,
      role: "sales_user",
    });

    if (!salesUser) {
      return res.status(404).json({
        success: false,
        message: "Sales user not found",
      });
    }

    // Verify sales manager exists
    const salesManager = await User.findOne({
      _id: salesManagerId,
      role: "subadmin",
      subRole: "sales_manager",
    });

    if (!salesManager) {
      return res.status(404).json({
        success: false,
        message: "Sales manager not found",
      });
    }

    // Check if user is already allocated to an active manager
    const existingAllocation = await UserAllocation.findOne({
      salesUser: salesUserId,
      isActive: true,
    });

    if (existingAllocation) {
      return res.status(409).json({
        success: false,
        message: "User is already allocated to another manager",
        allocatedTo: existingAllocation.salesManager,
      });
    }

    // Create new allocation
    const allocation = await UserAllocation.create({
      salesManager: salesManagerId,
      salesUser: salesUserId,
      allocatedBy: getUserId(req),
      remarks,
    });

    await allocation.populate([
      { path: "salesUser", select: "name email employeeId designation" },
      { path: "salesManager", select: "name email employeeId designation" },
    ]);

    return res.status(201).json({
      success: true,
      message: "User allocated to manager successfully",
      allocation,
    });
  } catch (error) {
    console.error("allocateUserToManager error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to allocate user to manager",
    });
  }
};

// Deallocate a sales user from a sales manager
export const deallocateUserFromManager = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only admin can deallocate users",
      });
    }

    const { allocationId } = req.params;

    if (!allocationId) {
      return res.status(400).json({
        success: false,
        message: "Allocation ID is required",
      });
    }

    const allocation = await UserAllocation.findById(allocationId);

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: "Allocation not found",
      });
    }

    // Update allocation to inactive
    allocation.isActive = false;
    allocation.deallocationDate = new Date();
    allocation.deallocatedBy = getUserId(req);
    await allocation.save();

    await allocation.populate([
      { path: "salesUser", select: "name email employeeId designation" },
      { path: "salesManager", select: "name email employeeId designation" },
    ]);

    return res.status(200).json({
      success: true,
      message: "User deallocated from manager successfully",
      allocation,
    });
  } catch (error) {
    console.error("deallocateUserFromManager error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to deallocate user",
    });
  }
};

// Get all allocations for a specific manager
export const getAllocationsForManager = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { managerId } = req.params;
    const { activeOnly = true } = req.query;

    if (!managerId) {
      return res.status(400).json({
        success: false,
        message: "Manager ID is required",
      });
    }

    const query = {
      salesManager: managerId,
    };

    if (activeOnly === "true" || activeOnly === true) {
      query.isActive = true;
    }

    const allocations = await UserAllocation.find(query)
      .populate("salesUser", "name email employeeId designation department")
      .populate("salesManager", "name email employeeId designation")
      .sort({ _id: -1 });

    return res.status(200).json({
      success: true,
      count: allocations.length,
      allocations,
    });
  } catch (error) {
    console.error("getAllocationsForManager error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch allocations",
    });
  }
};

// Get allocation status for a user
export const getAllocationStatusForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const allocation = await UserAllocation.findOne({
      salesUser: userId,
      isActive: true,
    })
      .populate("salesUser", "name email employeeId designation")
      .populate("salesManager", "name email employeeId designation");

    if (!allocation) {
      return res.status(200).json({
        success: true,
        allocated: false,
        allocation: null,
      });
    }

    return res.status(200).json({
      success: true,
      allocated: true,
      allocation,
    });
  } catch (error) {
    console.error("getAllocationStatusForUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch allocation status",
    });
  }
};

// Get all sales managers with their allocated users
export const getManagersWithAllocations = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get all sales managers
    const managers = await User.find({
      role: "subadmin",
      subRole: "sales_manager",
    }).select("name email employeeId designation department");

    // Get allocations for each manager
    const managersWithAllocations = await Promise.all(
      managers.map(async (manager) => {
        const allocations = await UserAllocation.find({
          salesManager: manager._id,
          isActive: true,
        }).populate("salesUser", "name email employeeId designation");

        return {
          ...manager.toObject(),
          allocatedUsers: allocations,
          allocatedCount: allocations.length,
        };
      })
    );

    return res.status(200).json({
      success: true,
      managers: managersWithAllocations,
    });
  } catch (error) {
    console.error("getManagersWithAllocations error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch managers with allocations",
    });
  }
};

// Bulk allocate users to a manager
export const bulkAllocateUsers = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only admin can allocate users",
      });
    }

    const { salesManagerId, userIds, remarks = "" } = req.body;

    if (!salesManagerId || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Sales manager ID and user IDs array are required",
      });
    }

    // Verify sales manager exists
    const salesManager = await User.findOne({
      _id: salesManagerId,
      role: "subadmin",
      subRole: "sales_manager",
    });

    if (!salesManager) {
      return res.status(404).json({
        success: false,
        message: "Sales manager not found",
      });
    }

    // Check for already allocated users
    const existingAllocations = await UserAllocation.find({
      salesUser: { $in: userIds },
      isActive: true,
    });

    const alreadyAllocatedUserIds = existingAllocations.map((a) =>
      String(a.salesUser)
    );
    const availableUserIds = userIds.filter(
      (id) => !alreadyAllocatedUserIds.includes(String(id))
    );

    if (availableUserIds.length === 0) {
      return res.status(409).json({
        success: false,
        message: "All selected users are already allocated to other managers",
      });
    }

    // Create allocations for available users
    const allocations = await UserAllocation.insertMany(
      availableUserIds.map((userId) => ({
        salesManager: salesManagerId,
        salesUser: userId,
        allocatedBy: getUserId(req),
        remarks,
      }))
    );

    // Populate the results
    const populatedAllocations = await UserAllocation.find({
      _id: { $in: allocations.map((a) => a._id) },
    })
      .populate("salesUser", "name email employeeId designation")
      .populate("salesManager", "name email employeeId designation");

    return res.status(201).json({
      success: true,
      message: `${availableUserIds.length} user(s) allocated successfully`,
      allocations: populatedAllocations,
      skippedCount: alreadyAllocatedUserIds.length,
      skippedUserIds: alreadyAllocatedUserIds,
    });
  } catch (error) {
    console.error("bulkAllocateUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to allocate users",
    });
  }
};

// Get unallocated sales users (for admin allocation page)
export const getUnallocatedSalesUsers = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { search = "" } = req.query;

    // Get all sales users
    const allSalesUsers = await User.find({
      role: "sales_user",
    }).select("name email employeeId designation department");

    // Get all actively allocated users
    const allocatedUserIds = await UserAllocation.find({
      isActive: true,
    }).distinct("salesUser");

    // Filter unallocated users
    let unallocatedUsers = allSalesUsers.filter(
      (user) =>
        !allocatedUserIds.some((allocId) => String(allocId) === String(user._id))
    );

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      unallocatedUsers = unallocatedUsers.filter((user) =>
        [user.name, user.email, user.employeeId, user.designation]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(searchLower)
          )
      );
    }

    return res.status(200).json({
      success: true,
      count: unallocatedUsers.length,
      users: unallocatedUsers,
    });
  } catch (error) {
    console.error("getUnallocatedSalesUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch unallocated users",
    });
  }
};
