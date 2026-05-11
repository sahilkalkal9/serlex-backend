import mongoose from "mongoose";
import SalesTarget from "../models/SalesTarget.js";
import User from "../models/User.js";
import PurchaseOrder from "../models/PurchaseOrder.js";

const isSalesManager = (user) => {
  return user?.role === "subadmin" && user?.subRole === "sales_manager";
};

const isAdmin = (user) => {
  return ["admin", "superadmin"].includes(user?.role);
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

    const userQuery = {
      role: "sales_user",
      status: { $ne: "inactive" },
    };

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

    const achievedRows = await PurchaseOrder.aggregate([
      {
        $match: {
          createdBy: {
            $in: salesUserIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
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

      const targetAmount = Number(target?.targetAmount || 0);
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
      .sort({ poDate: -1 });

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