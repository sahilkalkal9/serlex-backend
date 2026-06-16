import mongoose from "mongoose";
import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";
import SalesTarget from "../models/SalesTarget.js";
import ManagerTarget from "../models/ManagerTarget.js";
import ManagerAdminAllocation from "../models/ManagerAdminAllocation.js";
import { getDepartmentFilter } from "../utils/departmentFilter.js";
import { getSocketIO } from "../socket.js";

const isAdmin = (user) => {
  return ["admin", "superadmin", "radmin"].includes(user?.role);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const getRoleConfig = (user) => {
  const subRole = user?.subRole || "";
  if (subRole === "purchase_admin") {
    return { managerSubRole: "po_manager", userRole: "purchase_user" };
  }
  if (subRole === "ppc_admin") {
    return { managerSubRole: "ppc_manager", userRole: "ppc_user" };
  }
  return { managerSubRole: "sales_manager", userRole: "sales_user" };
};

const getAllocatedManagerIds = async (radminId) => {
  const allocations = await ManagerAdminAllocation.find({
    admin: radminId,
    isActive: true,
  }).select("manager").lean();
  return allocations.map((a) => String(a.manager));
};

// Allocate a user to a manager
export const allocateUserToManager = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only admin can allocate users to managers",
      });
    }

    const { salesUserId, salesManagerId, remarks = "" } = req.body;
    const { userRole, managerSubRole } = getRoleConfig(req.user);

    if (!salesUserId || !salesManagerId) {
      return res.status(400).json({
        success: false,
        message: "User ID and manager ID are required",
      });
    }

    // Verify user exists with correct role
    const targetUser = await User.findOne({
      _id: salesUserId,
      role: userRole,
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `${userRole.replace("_", " ")} not found`,
      });
    }

    const department = getDepartmentFilter(req.user);
    if (department && targetUser.department !== department) {
      return res.status(403).json({
        success: false,
        message: `You can only allocate users in the ${department} department`,
      });
    }

    // Verify manager exists
    const manager = await User.findOne({
      _id: salesManagerId,
      role: "subadmin",
      subRole: managerSubRole,
    });

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: "Manager not found",
      });
    }

    if (req.user.role === "radmin") {
      const allocatedIds = await getAllocatedManagerIds(req.user._id || req.user.id);
      if (!allocatedIds.includes(String(manager._id))) {
        return res.status(403).json({
          success: false,
          message: "You can only allocate users to managers assigned to you",
        });
      }
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

    if (req.user.role === "radmin") {
      const allocatedIds = await getAllocatedManagerIds(req.user._id || req.user.id);
      if (!allocatedIds.includes(String(allocation.salesManager))) {
        return res.status(403).json({
          success: false,
          message: "You can only deallocate users from managers assigned to you",
        });
      }
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

    const io = getSocketIO();
    if (io) {
      const radminId = req.user?._id || req.user?.id;
      io.to("room:radmin").emit("allocation:changed", { type: "user_deallocated" });
      if (radminId) io.to(`user:${radminId}`).emit("allocation:changed", { type: "user_deallocated" });
      io.to(`user:${allocation.salesManager}`).emit("allocation:changed", { type: "user_deallocated" });
    }

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

    if (req.user.role === "radmin") {
      const allocatedIds = await getAllocatedManagerIds(req.user._id || req.user.id);
      if (!allocatedIds.includes(String(managerId))) {
        return res.status(403).json({
          success: false,
          message: "You can only view allocations for managers assigned to you",
        });
      }
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

const getMonthlyKeysForQuarter = (periodKey) => {
  const [year, quarterText] = periodKey.split("-Q");
  const yearNum = Number(year);
  const quarter = Number(quarterText);
  const startMonth = (quarter - 1) * 3;
  return Array.from({ length: 3 }, (_, i) => {
    const m = startMonth + i + 1;
    return `${yearNum}-${String(m).padStart(2, "0")}`;
  });
};

const getMonthlyKeysForYear = (periodKey) => {
  const year = Number(periodKey);
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `${year}-${String(m).padStart(2, "0")}`;
  });
};

const getMonthlyKeysForPeriod = (period, periodKey) => {
  if (period === "Quarterly") return getMonthlyKeysForQuarter(periodKey);
  if (period === "Yearly") return getMonthlyKeysForYear(periodKey);
  return [periodKey];
};

const getPeriodDateRange = (period, periodKey) => {
  let startDate;
  let endDate;

  if (period === "Monthly") {
    const [year, month] = periodKey.split("-").map(Number);
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0);
  } else if (period === "Quarterly") {
    const [yearText, quarterText] = periodKey.split("-Q");
    const year = Number(yearText);
    const quarter = Number(quarterText);
    const startMonth = (quarter - 1) * 3;
    startDate = new Date(year, startMonth, 1);
    endDate = new Date(year, startMonth + 3, 0);
  } else if (period === "Yearly") {
    const year = Number(periodKey);
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  }

  if (!startDate || !endDate) return null;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
};

// Get all managers with their allocated users and targets
export const getManagersWithAllocations = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { period = "Monthly", periodKey } = req.query;
    const department = getDepartmentFilter(req.user);
    const { managerSubRole, userRole } = getRoleConfig(req.user);

    const managerQuery = {
      role: "subadmin",
      subRole: managerSubRole,
    };
    if (department) {
      managerQuery.department = department;
    }

    if (req.user.role === "radmin") {
      const allocatedIds = await getAllocatedManagerIds(req.user._id || req.user.id);
      if (allocatedIds.length === 0) {
        return res.status(200).json({ success: true, managers: [] });
      }
      managerQuery._id = { $in: allocatedIds };
    }

    const managers = await User.find(managerQuery)
      .select("name email employeeId designation department");

    const { default: PurchaseOrder } = await import("../models/PurchaseOrder.js");
    const dateRange = period && periodKey ? getPeriodDateRange(period, periodKey) : null;

    // Get allocations for each manager
    const managersWithAllocations = await Promise.all(
      managers.map(async (manager) => {
        const allocations = await UserAllocation.find({
          salesManager: manager._id,
          isActive: true,
        }).populate("salesUser", "name email employeeId designation");

        let target = null;
        if (period && periodKey) {
          target = await ManagerTarget.findOne({
            manager: manager._id,
            period,
            periodKey,
          }).select("targetAmount selfTarget teamTarget period periodKey remarks");

          // Compute targetAmount from self + team if targetAmount is 0
          if (target) {
            const tgtObj = target.toObject ? target.toObject() : target;
            const st = Number(tgtObj.selfTarget || 0);
            const tt = Number(tgtObj.teamTarget || 0);
            if (!tgtObj.targetAmount && (st || tt)) {
              tgtObj.targetAmount = st + tt;
            }
          }

          // If no direct quarterly/yearly target, aggregate from monthly targets
          if (!target && period !== "Monthly") {
            const monthlyKeys = getMonthlyKeysForPeriod(period, periodKey);
            const monthlyTargets = await ManagerTarget.find({
              manager: manager._id,
              period: "Monthly",
              periodKey: { $in: monthlyKeys },
            }).select("targetAmount selfTarget teamTarget periodKey");
            const totalMonths = monthlyKeys.length;
            const filledCount = monthlyTargets.length;
            if (filledCount > 0) {
              const sum = monthlyTargets.reduce((s, t) => s + (Number(t.targetAmount || (t.selfTarget || 0) + (t.teamTarget || 0)) || 0), 0);
              const selfSum = monthlyTargets.reduce((s, t) => s + (Number(t.selfTarget || 0)), 0);
              const teamSum = monthlyTargets.reduce((s, t) => s + (Number(t.teamTarget || 0)), 0);
              const projectedAmount = Math.round((sum / filledCount) * totalMonths);
              target = {
                _id: null,
                targetAmount: projectedAmount,
                selfTarget: Math.round((selfSum / filledCount) * totalMonths),
                teamTarget: Math.round((teamSum / filledCount) * totalMonths),
                period,
                periodKey,
                remarks: `Projected from ${filledCount}/${totalMonths} monthly target(s)`,
              };
            }
          }
        }

        // Compute PO-based achievement for this manager + team
        let achievedAmount = 0;
        let personalAchieved = 0;
        let teamAchieved = 0;
        let userAchievementMap = new Map();

        if (dateRange) {
          const allocatedUserIds = allocations
            .map((a) => a.salesUser?._id)
            .filter(Boolean);

          // Manager's own POs (personal contribution)
          const personalResult = await PurchaseOrder.aggregate([
            {
              $match: {
                createdBy: new mongoose.Types.ObjectId(manager._id),
                poDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
              },
            },
            { $group: { _id: null, total: { $sum: "$poValue" } } },
          ]);
          personalAchieved = Number(personalResult?.[0]?.total || 0);

          // Team POs — group by user to get per-user achievement
          if (allocatedUserIds.length > 0) {
            const teamResult = await PurchaseOrder.aggregate([
              {
                $match: {
                  createdBy: { $in: allocatedUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
                  poDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
                },
              },
              {
                $group: {
                  _id: "$createdBy",
                  amount: { $sum: "$poValue" },
                  count: { $sum: 1 },
                },
              },
            ]);

            teamAchieved = teamResult.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            teamResult.forEach((r) => {
              userAchievementMap.set(r._id.toString(), {
                achievedAmount: Number(r.amount) || 0,
                poCount: Number(r.count) || 0,
              });
            });
          }

          achievedAmount = personalAchieved + teamAchieved;
        }

        // Attach per-user achievement to each allocated user
        const allocatedUsersWithAchievement = allocations.map((allocation) => {
          const allocObj = allocation.toObject ? allocation.toObject() : { ...allocation };
          const userId = allocation.salesUser?._id?.toString();
          const achievement = userAchievementMap.get(userId);
          return {
            ...allocObj,
            achievedAmount: achievement?.achievedAmount || 0,
            poCount: achievement?.poCount || 0,
          };
        });

        const targetAmount = Number(target?.targetAmount || 0);
        const achievementPercentage = targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;

        return {
          ...manager.toObject(),
          allocatedUsers: allocatedUsersWithAchievement,
          allocatedCount: allocations.length,
          target: target
            ? {
                _id: target._id,
                targetAmount,
                selfTarget: Number(target?.selfTarget || 0),
                teamTarget: Number(target?.teamTarget || 0),
                period: target.period,
                periodKey: target.periodKey,
                remarks: target.remarks,
                achievedAmount,
                personalAchieved,
                teamAchieved,
                achievementPercentage,
              }
            : null,
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
    const { managerSubRole, userRole } = getRoleConfig(req.user);

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
      subRole: managerSubRole,
    });

    if (!salesManager) {
      return res.status(404).json({
        success: false,
        message: "Sales manager not found",
      });
    }

    if (req.user.role === "radmin") {
      const allocatedIds = await getAllocatedManagerIds(req.user._id || req.user.id);
      if (!allocatedIds.includes(String(salesManager._id))) {
        return res.status(403).json({
          success: false,
          message: "You can only allocate users to managers assigned to you",
        });
      }
    }

    const deptFilter = getDepartmentFilter(req.user);
    if (deptFilter) {
      const validUsers = await User.find({
        _id: { $in: userIds },
        department: deptFilter,
      }).select("_id").lean();
      const validUserIds = validUsers.map((u) => String(u._id));
      const invalidUsers = userIds.filter((id) => !validUserIds.includes(String(id)));
      if (invalidUsers.length > 0) {
        return res.status(403).json({
          success: false,
          message: `You can only allocate users in the ${deptFilter} department`,
        });
      }
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

    const io = getSocketIO();
    if (io) {
      const radminId = req.user?._id || req.user?.id;
      io.to("room:radmin").emit("allocation:changed", { type: "users_allocated", count: availableUserIds.length });
      if (radminId) io.to(`user:${radminId}`).emit("allocation:changed", { type: "users_allocated", count: availableUserIds.length });
      io.to(`user:${salesManagerId}`).emit("allocation:changed", { type: "users_allocated", count: availableUserIds.length });
    }

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

// Get unallocated users (for admin allocation page)
export const getUnallocatedSalesUsers = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { search = "" } = req.query;
    const department = getDepartmentFilter(req.user);
    const { userRole } = getRoleConfig(req.user);

    const userQuery = {
      role: userRole,
    };
    if (department) {
      userQuery.department = department;
    }

    const allUsers = await User.find(userQuery)
      .select("name email employeeId designation department");

    // Get all actively allocated users
    const allocatedUserIds = await UserAllocation.find({
      isActive: true,
    }).distinct("salesUser");

    // Filter unallocated users
    let unallocatedUsers = allUsers.filter(
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
