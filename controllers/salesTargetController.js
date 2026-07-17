import mongoose from "mongoose";
import SalesTarget from "../models/SalesTarget.js";
import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";
import PurchaseOrder from "../models/PurchaseOrder.js";

const isSalesManager = (user) => {
  return user?.role === "subadmin" && user?.subRole === "sales_manager";
};

const isAdmin = (user) => {
  return ["admin", "superadmin", "radmin"].includes(user?.role);
};

const canAccessTargetModule = (user) => {
  return isAdmin(user) || isSalesManager(user);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const formatMoney = (amount = 0) => {
  if (amount >= 10000000) return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(2)} L`;
  return `₹ ${Number(amount || 0).toLocaleString("en-IN")}`;
};

const getPeriodDateRange = (period, periodKey) => {
  let startDate;
  let endDate;

  if (period === "Monthly") {
    const [year, month] = periodKey.split("-").map(Number);

    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0);
  }

  if (period === "Quarterly") {
    const [yearText, quarterText] = periodKey.split("-Q");
    const year = Number(yearText);
    const quarter = Number(quarterText);

    const startMonth = (quarter - 1) * 3;

    startDate = new Date(year, startMonth, 1);
    endDate = new Date(year, startMonth + 3, 0);
  }

  if (period === "Yearly") {
    const year = Number(periodKey);

    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  }

  if (!startDate || !endDate) {
    return null;
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
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

export const upsertSalesTarget = async (req, res) => {
  try {
    if (!canAccessTargetModule(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { salesUserId, period, periodKey, targetAmount, remarks = "" } = req.body;

    if (!salesUserId || !period || !periodKey || !targetAmount) {
      return res.status(400).json({
        success: false,
        message: "Sales user, period, period key and target amount are required",
      });
    }

    if (!["Monthly", "Quarterly", "Yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
      });
    }

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

    const target = await SalesTarget.findOneAndUpdate(
      {
        salesUser: salesUserId,
        period,
        periodKey,
      },
      {
        salesUser: salesUserId,
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
    ).populate("salesUser", "name email employeeId mobileNumber designation department");

    return res.status(200).json({
      success: true,
      message: "Sales target saved successfully",
      target,
    });
  } catch (error) {
    console.error("upsertSalesTarget error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Target already exists for this period",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save sales target",
    });
  }
};

export const getSalesTargetAchievementReport = async (req, res) => {
  try {
    if (!canAccessTargetModule(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const {
      period = "Monthly",
      periodKey,
      salesUserId = "all",
      search = "",
    } = req.query;

    if (!periodKey) {
      return res.status(400).json({
        success: false,
        message: "periodKey is required",
      });
    }

    if (!["Monthly", "Quarterly", "Yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);

    if (!dateRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid period key",
      });
    }

    // For sales managers, only show allocated team members
    let allowedUserIds = null;
    if (isSalesManager(req.user)) {
      const managerId = req.user.id || req.user._id;
      const allocations = await UserAllocation.find({
        salesManager: managerId,
        isActive: true,
      }).select("salesUser");
      allowedUserIds = allocations.map((a) => a.salesUser);
      if (allowedUserIds.length === 0) {
        return res.status(200).json({
          success: true,
          rows: [],
          cards: {
            totalMembers: 0,
            totalTarget: 0,
            totalAchieved: 0,
            totalPOs: 0,
            achievementPercentage: 0,
            formattedTotalTarget: "₹ 0",
            formattedTotalAchieved: "₹ 0",
          },
        });
      }
    }

    const userQuery = {
      role: "sales_user",
      status: { $ne: "inactive" },
    };

    if (allowedUserIds) {
      userQuery._id = { $in: allowedUserIds };
    }

    if (salesUserId && salesUserId !== "all") {
      userQuery._id = salesUserId;
    }

    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
      ];
    }

    const salesUsers = await User.find(userQuery)
      .select("name email employeeId mobileNumber designation department")
      .sort({ name: 1 });

    const salesUserIds = salesUsers.map((user) => user._id);

    const targets = await SalesTarget.find({
      salesUser: { $in: salesUserIds },
      period,
      periodKey,
    });

    const targetMap = new Map(
      targets.map((target) => [target.salesUser.toString(), target])
    );

    let monthlyAggTargetMap = new Map();

    if (period !== "Monthly") {
      const monthlyKeys = getMonthlyKeysForPeriod(period, periodKey);
      const totalMonths = monthlyKeys.length;

      const monthlyTargets = await SalesTarget.aggregate([
        {
          $match: {
            salesUser: { $in: salesUserIds },
            period: "Monthly",
            periodKey: { $in: monthlyKeys },
          },
        },
        {
          $group: {
            _id: "$salesUser",
            targetAmount: { $sum: "$targetAmount" },
            monthCount: { $sum: 1 },
          },
        },
      ]);

      monthlyAggTargetMap = new Map(
        monthlyTargets.map((t) => [
          t._id.toString(),
          Math.round((t.targetAmount / t.monthCount) * totalMonths),
        ])
      );
    }

    const achievedRows = await PurchaseOrder.aggregate([
      {
        $match: {
          createdBy: {
            $in: salesUserIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
          status: "Completed",
          poDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$createdBy",
          achievedAmount: { $sum: "$poValue" },
          poCount: { $sum: 1 },
        },
      },
    ]);

    const achievedMap = new Map(
      achievedRows.map((row) => [
        row._id.toString(),
        {
          achievedAmount: row.achievedAmount,
          poCount: row.poCount,
        },
      ])
    );

    const rows = salesUsers.map((user) => {
      const target = targetMap.get(user._id.toString());
      const achieved = achievedMap.get(user._id.toString());

      const targetAmount = Number(
        target?.targetAmount || monthlyAggTargetMap.get(user._id.toString()) || 0
      );
      const achievedAmount = Number(achieved?.achievedAmount || 0);
      const achievementPercentage =
        targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;

      return {
        salesUser: {
          _id: user._id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
          mobileNumber: user.mobileNumber,
          designation: user.designation,
          department: user.department,
        },
        targetId: target?._id || null,
        period,
        periodKey,
        targetAmount,
        achievedAmount,
        poCount: achieved?.poCount || 0,
        achievementPercentage,
        pendingAmount: Math.max(targetAmount - achievedAmount, 0),
        overAchievedAmount:
          achievedAmount > targetAmount ? achievedAmount - targetAmount : 0,
        remarks: target?.remarks || "",
        formattedTarget: formatMoney(targetAmount),
        formattedAchieved: formatMoney(achievedAmount),
      };
    });

    const totalTarget = rows.reduce(
      (sum, row) => sum + Number(row.targetAmount || 0),
      0
    );

    const totalAchieved = rows.reduce(
      (sum, row) => sum + Number(row.achievedAmount || 0),
      0
    );

    return res.status(200).json({
      success: true,
      period,
      periodKey,
      cards: {
        totalMembers: rows.length,
        totalTarget,
        totalAchieved,
        totalPOs: rows.reduce((sum, row) => sum + Number(row.poCount || 0), 0),
        achievementPercentage:
          totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
        formattedTotalTarget: formatMoney(totalTarget),
        formattedTotalAchieved: formatMoney(totalAchieved),
      },
      rows,
    });
  } catch (error) {
    console.error("getSalesTargetAchievementReport error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch target achievement report",
    });
  }
};

export const getSalesTargetPODetails = async (req, res) => {
  try {
    if (!canAccessTargetModule(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { salesUserId } = req.params;
    const { period = "Monthly", periodKey } = req.query;

    if (!salesUserId || !periodKey) {
      return res.status(400).json({
        success: false,
        message: "Sales user and period key are required",
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);

    if (!dateRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid period key",
      });
    }

    const orders = await PurchaseOrder.find({
      createdBy: salesUserId,
      poDate: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      },
    })
      .select("poNo companyName category poValue poDate status trackingStatus")
      .sort({ _id: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("getSalesTargetPODetails error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch PO details",
    });
  }
};

export const getMySalesTargetReport = async (req, res) => {
  try {
    const salesUserId = getUserId(req);
    const { period = "Monthly", periodKey } = req.query;

    if (!salesUserId || !periodKey) {
      return res.status(400).json({
        success: false,
        message: "Period key is required",
      });
    }

    if (!["Monthly", "Quarterly", "Yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);

    if (!dateRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid period key",
      });
    }

    const target = await SalesTarget.findOne({
      salesUser: salesUserId,
      period,
      periodKey,
    })
      .populate("salesUser", "name email employeeId mobileNumber designation department")
      .populate("createdBy", "name email role subRole designation")
      .populate("updatedBy", "name email role subRole designation");

    let monthlyAggTarget = 0;

    if (period !== "Monthly") {
      const monthlyKeys = getMonthlyKeysForPeriod(period, periodKey);
      const totalMonths = monthlyKeys.length;

      const monthlyTargets = await SalesTarget.aggregate([
        {
          $match: {
            salesUser: new mongoose.Types.ObjectId(salesUserId),
            period: "Monthly",
            periodKey: { $in: monthlyKeys },
          },
        },
        {
          $group: {
            _id: "$salesUser",
            targetAmount: { $sum: "$targetAmount" },
            monthCount: { $sum: 1 },
          },
        },
      ]);

      const sum = Number(monthlyTargets?.[0]?.targetAmount || 0);
      const filledCount = Number(monthlyTargets?.[0]?.monthCount || 0);
      monthlyAggTarget = filledCount > 0 ? Math.round((sum / filledCount) * totalMonths) : 0;
    }

    const achievedRows = await PurchaseOrder.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(salesUserId),
          status: "Completed",
          poDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$createdBy",
          achievedAmount: { $sum: "$poValue" },
          poCount: { $sum: 1 },
        },
      },
    ]);

    const achievedAmount = Number(achievedRows?.[0]?.achievedAmount || 0);
    const poCount = Number(achievedRows?.[0]?.poCount || 0);
    const targetAmount = Number(target?.targetAmount || monthlyAggTarget || 0);

    const achievementPercentage =
      targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;

    const row = {
      salesUser: target?.salesUser || null,
      targetId: target?._id || null,
      period,
      periodKey,
      targetAmount,
      achievedAmount,
      poCount,
      achievementPercentage,
      pendingAmount: Math.max(targetAmount - achievedAmount, 0),
      overAchievedAmount:
        achievedAmount > targetAmount ? achievedAmount - targetAmount : 0,
      remarks: target?.remarks || "",
      targetGivenBy: target?.createdBy || null,
      updatedBy: target?.updatedBy || null,
      formattedTarget: formatMoney(targetAmount),
      formattedAchieved: formatMoney(achievedAmount),
    };

    return res.status(200).json({
      success: true,
      target: row,
      cards: {
        targetAmount,
        achievedAmount,
        totalTarget: targetAmount,
        totalAchieved: achievedAmount,
        totalPOs: poCount,
        achievementPercentage,
        formattedTotalTarget: formatMoney(targetAmount),
        formattedTotalAchieved: formatMoney(achievedAmount),
      },
    });
  } catch (error) {
    console.error("getMySalesTargetReport error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch my target report",
    });
  }
};

export const getMySalesTargetPODetails = async (req, res) => {
  try {
    const salesUserId = getUserId(req);
    const { period = "Monthly", periodKey } = req.query;

    if (!salesUserId || !periodKey) {
      return res.status(400).json({
        success: false,
        message: "Period key is required",
      });
    }

    if (!["Monthly", "Quarterly", "Yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
      });
    }

    const dateRange = getPeriodDateRange(period, periodKey);

    if (!dateRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid period key",
      });
    }

    const orders = await PurchaseOrder.find({
      createdBy: salesUserId,
      poDate: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      },
    })
      .select(
        "poNo companyName category poValue poDate status trackingStatus expectedDeliveryDate deliveryDate"
      )
      .sort({ _id: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("getMySalesTargetPODetails error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch my PO details",
    });
  }
};