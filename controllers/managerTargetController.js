import mongoose from "mongoose";
import ManagerTarget from "../models/ManagerTarget.js";
import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";

const isAdmin = (user) => {
  return ["admin", "superadmin"].includes(user?.role);
};

const isSalesManager = (user) => {
  return user?.role === "subadmin" && user?.subRole === "sales_manager";
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
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

export const upsertManagerTarget = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only admin can set manager targets",
      });
    }

    const { managerId, period, periodKey, targetAmount, remarks = "" } = req.body;

    if (!managerId || !period || !periodKey || targetAmount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Manager ID, period, period key and target amount are required",
      });
    }

    if (!["Monthly", "Quarterly", "Yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
      });
    }

    const manager = await User.findOne({
      _id: managerId,
      role: "subadmin",
      subRole: "sales_manager",
    });

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: "Sales manager not found",
      });
    }

    const target = await ManagerTarget.findOneAndUpdate(
      {
        manager: managerId,
        period,
        periodKey,
      },
      {
        manager: managerId,
        period,
        periodKey,
        targetAmount: Number(targetAmount || 0),
        remarks,
        updatedBy: getUserId(req),
        $setOnInsert: {
          createdBy: getUserId(req),
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    ).populate("manager", "name email employeeId designation department");

    return res.status(200).json({
      success: true,
      message: "Manager target saved successfully",
      target,
    });
  } catch (error) {
    console.error("upsertManagerTarget error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Target already exists for this period",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save manager target",
    });
  }
};

export const getManagerTarget = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { period = "Monthly", periodKey } = req.query;

    if (!managerId) {
      return res.status(400).json({
        success: false,
        message: "Manager ID is required",
      });
    }

    const query = { manager: managerId };

    if (period && periodKey) {
      query.period = period;
      query.periodKey = periodKey;
    }

    const targets = await ManagerTarget.find(query)
      .populate("manager", "name email employeeId designation department")
      .populate("createdBy", "name email role subRole")
      .populate("updatedBy", "name email role subRole")
      .sort({ _id: -1 });

    return res.status(200).json({
      success: true,
      count: targets.length,
      targets,
    });
  } catch (error) {
    console.error("getManagerTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch manager target",
    });
  }
};

export const getAllManagerTargets = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { period = "Monthly", periodKey } = req.query;

    const query = {};
    if (period && periodKey) {
      query.period = period;
      query.periodKey = periodKey;
    }

    const targets = await ManagerTarget.find(query)
      .populate("manager", "name email employeeId designation department")
      .populate("createdBy", "name email role subRole")
      .populate("updatedBy", "name email role subRole")
      .sort({ _id: -1 });

    const targetMap = {};
    targets.forEach((t) => {
      const mid = t.manager?._id?.toString();
      if (mid) {
        targetMap[mid] = t;
      }
    });

    return res.status(200).json({
      success: true,
      count: targets.length,
      targets,
      targetMap,
    });
  } catch (error) {
    console.error("getAllManagerTargets error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch manager targets",
    });
  }
};

export const getMyManagerTarget = async (req, res) => {
  try {
    if (!isSalesManager(req.user) && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const managerId = getUserId(req);
    const { period = "Monthly", periodKey } = req.query;

    if (!periodKey) {
      return res.status(400).json({
        success: false,
        message: "Period key is required",
      });
    }

    let target = await ManagerTarget.findOne({
      manager: managerId,
      period,
      periodKey,
    }).populate("manager", "name email employeeId designation department");

    let targetAmount = 0;
    let targetRemarks = "";
    let projectedFromMonthly = false;

    if (target) {
      targetAmount = Number(target.targetAmount || 0);
      targetRemarks = target.remarks || "";
    } else if (period !== "Monthly") {
      // Project from monthly targets
      const monthlyKeys = getMonthlyKeysForPeriod(period, periodKey);
      const monthlyTargets = await ManagerTarget.find({
        manager: managerId,
        period: "Monthly",
        periodKey: { $in: monthlyKeys },
      }).select("targetAmount periodKey");
      const filledCount = monthlyTargets.length;
      if (filledCount > 0) {
        const sum = monthlyTargets.reduce((s, t) => s + (Number(t.targetAmount) || 0), 0);
        targetAmount = Math.round((sum / filledCount) * monthlyKeys.length);
        targetRemarks = `Projected from ${filledCount}/${monthlyKeys.length} monthly target(s)`;
        projectedFromMonthly = true;
      }
    }

    if (!target && !projectedFromMonthly) {
      return res.status(200).json({
        success: true,
        hasTarget: false,
        target: null,
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);

    const allocatedUsers = await UserAllocation.find({
      salesManager: managerId,
      isActive: true,
    }).populate("salesUser", "name email employeeId designation department");

    const allocatedUserIds = allocatedUsers.map((a) => a.salesUser?._id).filter(Boolean);

    let achievedAmount = 0;
    let teamAchieved = 0;

    if (dateRange) {
      const { default: PurchaseOrder } = await import("../models/PurchaseOrder.js");

      const personalAchieved = await PurchaseOrder.aggregate([
        {
          $match: {
            createdBy: new mongoose.Types.ObjectId(managerId),
            poDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$poValue" } } },
      ]);

      achievedAmount = Number(personalAchieved?.[0]?.total || 0);

      if (allocatedUserIds.length > 0) {
        const teamAchievedResult = await PurchaseOrder.aggregate([
          {
            $match: {
              createdBy: { $in: allocatedUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
              poDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
            },
          },
          { $group: { _id: null, total: { $sum: "$poValue" } } },
        ]);
        teamAchieved = Number(teamAchievedResult?.[0]?.total || 0);
      }
    }

    const totalAchieved = achievedAmount + teamAchieved;
    const achievementPercentage = targetAmount > 0 ? (totalAchieved / targetAmount) * 100 : 0;

    return res.status(200).json({
      success: true,
      hasTarget: true,
      target: {
        _id: target?._id || null,
        manager: target?.manager || null,
        period,
        periodKey,
        targetAmount,
        achievedAmount: totalAchieved,
        personalAchieved: achievedAmount,
        teamAchieved,
        teamMemberCount: allocatedUsers.length,
        achievementPercentage,
        remarks: targetRemarks,
        createdAt: target?.createdAt,
        updatedAt: target?.updatedAt,
      },
    });
  } catch (error) {
    console.error("getMyManagerTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch my manager target",
    });
  }
};

export const getManagerPos = async (req, res) => {
  try {
    if (!isAdmin(req.user) && !isSalesManager(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { managerId } = req.params;
    const { period = "Monthly", periodKey } = req.query;

    if (!managerId || !period || !periodKey) {
      return res.status(400).json({
        success: false,
        message: "Manager ID, period and period key are required",
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);
    if (!dateRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid period or period key",
      });
    }

    const allocatedUsers = await UserAllocation.find({
      salesManager: managerId,
      isActive: true,
    }).select("salesUser");

    const teamUserIds = allocatedUsers.map((a) => a.salesUser).filter(Boolean);
    const allCreatorIds = [new mongoose.Types.ObjectId(managerId), ...teamUserIds.map((id) => new mongoose.Types.ObjectId(id))];

    const { default: PurchaseOrder } = await import("../models/PurchaseOrder.js");

    const pos = await PurchaseOrder.find({
      createdBy: { $in: allCreatorIds },
      poDate: { $gte: dateRange.startDate, $lte: dateRange.endDate },
    })
      .populate("createdBy", "name email employeeId designation role subRole")
      .sort({ poDate: -1, _id: -1 });

    // Annotate each PO with creator type
    const posWithType = pos.map((po) => {
      const poObj = po.toObject();
      const creatorId = po.createdBy?._id?.toString();
      poObj.creatorType = creatorId === managerId ? "manager" : "team";
      return poObj;
    });

    return res.status(200).json({
      success: true,
      count: pos.length,
      period,
      periodKey,
      pos: posWithType,
    });
  } catch (error) {
    console.error("getManagerPos error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch manager POs",
    });
  }
};
