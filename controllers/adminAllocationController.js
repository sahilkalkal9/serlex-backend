import User from "../models/User.js";
import AdminTarget from "../models/AdminTarget.js";
import ManagerTarget from "../models/ManagerTarget.js";
import ManagerAdminAllocation from "../models/ManagerAdminAllocation.js";
import UserAllocation from "../models/UserAllocation.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import { getDepartmentFilter } from "../utils/departmentFilter.js";

const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getPeriodKeys = (period, baseKey) => {
  if (!baseKey) return [];
  const [year, month] = baseKey.split("-").map(Number);
  if (period === "Monthly") return [baseKey];
  if (period === "Quarterly") {
    const qStart = Math.floor((month - 1) / 3) * 3 + 1;
    return [0, 1, 2].map((i) => {
      const m = qStart + i;
      return `${year}-${String(m).padStart(2, "0")}`;
    });
  }
  if (period === "Yearly") {
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  }
  return [];
};

export const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({
      role: "radmin",
      status: { $ne: "inactive" },
    })
      .select("name email employeeId department designation subRole")
      .sort({ name: 1 })
      .lean();

    const adminIds = admins.map((a) => a._id);
    const allocations = await ManagerAdminAllocation.find({
      admin: { $in: adminIds },
      isActive: true,
    })
      .populate("manager", "name email employeeId designation department subRole")
      .lean();

    const allocationMap = {};
    allocations.forEach((a) => {
      const adminId = String(a.admin);
      if (!allocationMap[adminId]) allocationMap[adminId] = [];
      allocationMap[adminId].push(a);
    });

    const currentMonthKey = getMonthKey(new Date());
    const prevMonthKey = getMonthKey(new Date(new Date().setMonth(new Date().getMonth() - 1)));

    const [
      adminTargets,
      managerTargets,
      userAllocations,
      allPos,
    ] = await Promise.all([
      AdminTarget.find({
        admin: { $in: adminIds },
        period: "Monthly",
        periodKey: { $in: [currentMonthKey, prevMonthKey] },
      }).lean(),
      ManagerTarget.find({
        manager: { $in: allocations.map((a) => a.manager._id) },
        period: "Monthly",
        periodKey: { $in: [currentMonthKey, prevMonthKey] },
      }).lean(),
      UserAllocation.find({
        salesManager: { $in: allocations.map((a) => a.manager._id) },
        isActive: true,
      }).select("salesManager salesUser").lean(),
      PurchaseOrder.find({
        poDate: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          $lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999),
        },
      }).select("createdBy poValue poDate").lean(),
    ]);

    const targetMap = {};
    adminTargets.forEach((t) => {
      const key = String(t.admin);
      if (!targetMap[key]) targetMap[key] = {};
      targetMap[key][t.periodKey] = t;
    });

    const managerTargetMap = {};
    managerTargets.forEach((t) => {
      const key = String(t.manager);
      if (!managerTargetMap[key]) managerTargetMap[key] = {};
      managerTargetMap[key][t.periodKey] = t;
    });

    const managerSalesUsersMap = {};
    userAllocations.forEach((ua) => {
      const mgrId = String(ua.salesManager);
      if (!managerSalesUsersMap[mgrId]) managerSalesUsersMap[mgrId] = [];
      managerSalesUsersMap[mgrId].push(String(ua.salesUser));
    });

    // Build PO lookup: user -> total poValue
    const poByUser = {};
    allPos.forEach((po) => {
      const uid = String(po.createdBy);
      poByUser[uid] = (poByUser[uid] || 0) + Number(po.poValue || 0);
    });

    const adminsWithAllocations = admins.map((admin) => {
      const adminId = String(admin._id);
      const adminAllocations = allocationMap[adminId] || [];
      const managerIds = adminAllocations.map((a) => String(a.manager._id));

      // Collect all relevant user IDs (managers + their sales users)
      const allUserIds = new Set(managerIds);
      managerIds.forEach((mgrId) => {
        (managerSalesUsersMap[mgrId] || []).forEach((uid) => allUserIds.add(uid));
      });

      // Total achievement for current month
      let achievement = 0;
      allUserIds.forEach((uid) => {
        achievement += poByUser[uid] || 0;
      });

      // Get target for current month, fallback to previous month
      const adminTargetsMap = targetMap[adminId] || {};
      const target = adminTargetsMap[currentMonthKey] || adminTargetsMap[prevMonthKey] || null;
      const targetAmount = target ? Number(target.targetAmount || 0) : 0;
      const targetPeriodKey = target ? target.periodKey : null;

      const achievementPercent = targetAmount > 0
        ? Math.min(Math.round((achievement / targetAmount) * 100), 100)
        : 0;

      return {
        ...admin,
        id: adminId,
        managers: adminAllocations.map((a) => {
          const mgrId = String(a.manager._id);
          const mgrSalesUserIds = managerSalesUsersMap[mgrId] || [];
          const mgrAllUserIds = new Set([mgrId, ...mgrSalesUserIds]);

          let mgrAchievement = 0;
          mgrAllUserIds.forEach((uid) => {
            mgrAchievement += poByUser[uid] || 0;
          });

          const mgrTargetEntry = managerTargetMap[mgrId] || {};
          const mgrTarget = mgrTargetEntry[currentMonthKey] || mgrTargetEntry[prevMonthKey] || null;
          const mgrTargetAmount = mgrTarget ? Number(mgrTarget.targetAmount || 0) : 0;
          const mgrAchievementPercent = mgrTargetAmount > 0
            ? Math.min(Math.round((mgrAchievement / mgrTargetAmount) * 100), 100)
            : 0;

          return {
            ...a.manager,
            allocationId: a._id,
            target: mgrTargetAmount,
            achievement: mgrAchievement,
            achievementPercent: mgrAchievementPercent,
          };
        }),
        allocatedCount: adminAllocations.length,
        target: targetAmount,
        targetPeriodKey,
        achievement,
        achievementPercent,
      };
    });

    return res.json({ success: true, admins: adminsWithAllocations });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUnallocatedManagers = async (req, res) => {
  try {
    const allocatedManagerIds = await ManagerAdminAllocation.find({ isActive: true })
      .distinct("manager");

    const managers = await User.find({
      role: "subadmin",
      status: { $ne: "inactive" },
      _id: { $nin: allocatedManagerIds },
    })
      .select("name email employeeId department designation subRole")
      .sort({ name: 1 })
      .lean();

    return res.json({ success: true, managers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const allocateManagerToAdmin = async (req, res) => {
  try {
    const { adminId, managerId, managerIds } = req.body;
    const ids = managerIds || (managerId ? [managerId] : []);

    if (!adminId || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Admin ID and at least one Manager ID are required" });
    }

    const admin = await User.findOne({ _id: adminId, role: "radmin" });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const managers = await User.find({ _id: { $in: ids }, role: "subadmin" });
    if (managers.length !== ids.length) {
      return res.status(404).json({ success: false, message: "One or more managers not found" });
    }

    const existing = await ManagerAdminAllocation.find({
      manager: { $in: ids },
      isActive: true,
    }).distinct("manager");

    const alreadyAllocated = existing.map(String);
    const availableIds = ids.filter((id) => !alreadyAllocated.includes(String(id)));

    if (availableIds.length === 0) {
      return res.status(409).json({ success: false, message: "All selected managers are already allocated" });
    }

    const allocations = await ManagerAdminAllocation.insertMany(
      availableIds.map((mgrId) => ({
        admin: adminId,
        manager: mgrId,
        allocatedBy: req.user?.id || req.user?._id,
      }))
    );

    return res.status(201).json({
      success: true,
      message: `${allocations.length} manager(s) allocated`,
      allocations,
      skipped: alreadyAllocated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deallocateManager = async (req, res) => {
  try {
    const { allocationId } = req.params;
    const allocation = await ManagerAdminAllocation.findById(allocationId);
    if (!allocation) {
      return res.status(404).json({ success: false, message: "Allocation not found" });
    }

    allocation.isActive = false;
    allocation.deallocatedAt = new Date();
    allocation.deallocatedBy = req.user?.id || req.user?._id;
    await allocation.save();

    return res.json({ success: true, message: "Manager deallocated" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const setAdminTarget = async (req, res) => {
  try {
    const { adminId, period, periodKey, targetAmount, remarks } = req.body;
    if (!adminId || !period || !periodKey || targetAmount === undefined) {
      return res.status(400).json({ success: false, message: "Admin ID, period, periodKey and target amount are required" });
    }

    if (Number(targetAmount) <= 0) {
      return res.status(400).json({ success: false, message: "Target amount must be greater than 0" });
    }

    const target = await AdminTarget.findOneAndUpdate(
      { admin: adminId, period, periodKey },
      {
        admin: adminId,
        period,
        periodKey,
        targetAmount: Number(targetAmount),
        allocatedBy: req.user?.id || req.user?._id,
        remarks: remarks || "",
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, target });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminTargets = async (req, res) => {
  try {
    const { adminId } = req.params;
    const targets = await AdminTarget.find({ admin: adminId })
      .sort({ periodKey: -1 })
      .lean();
    return res.json({ success: true, targets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
