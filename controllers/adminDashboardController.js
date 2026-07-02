import Activity from "../models/Activity.js";
import bcrypt from "bcryptjs";
import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";
import { getDepartmentFilter } from "../utils/departmentFilter.js";

const getDateRange = (fromDate, toDate) => {
  const now = new Date();
  const start = fromDate
    ? new Date(fromDate + "T00:00:00")
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = toDate
    ? new Date(toDate + "T23:59:59.999")
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return { start, end };
};

export const getAdminDashboard = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const department = getDepartmentFilter(req.user);

    let departmentUserIds = null;
    if (department) {
      const deptUsers = await User.find({
        department,
        status: { $ne: "inactive" },
      })
        .select("_id")
        .lean();
      departmentUserIds = deptUsers.map((u) => u._id);
    }

    const meetingRangeQuery = {
      startTime: { $gte: start, $lte: end },
    };
    if (departmentUserIds) {
      meetingRangeQuery.createdBy = { $in: departmentUserIds };
    }

    const poRangeQuery = {
      poDate: { $gte: start, $lte: end },
    };
    if (departmentUserIds) {
      poRangeQuery.createdBy = { $in: departmentUserIds };
    }

    const activityRangeQuery = {
      loginTime: { $gte: start, $lte: end },
    };
    if (departmentUserIds) {
      activityRangeQuery.user = { $in: departmentUserIds };
    }

    const userBaseQuery = { status: { $ne: "inactive" } };
    if (department) {
      userBaseQuery.department = department;
    }

    const nonAdminBaseQuery = {
      status: { $ne: "inactive" },
      role: { $nin: ["superadmin", "admin", "radmin"] },
    };
    if (department) {
      nonAdminBaseQuery.department = department;
    }

    const [
      meetingsScheduled,
      meetingsConfirmed,
      meetingsPending,
      currentMonthPOs,
      activeEmployees,
      recentMeetings,
      recentPOs,
      recentLogins,
      rangeActivities,
      totalUsers,
      nonAdminUsers,
    ] = await Promise.all([
      Meeting.countDocuments({
        ...meetingRangeQuery,
        status: { $ne: "cancelled" },
      }),
      Meeting.countDocuments({
        ...meetingRangeQuery,
        status: { $ne: "cancelled" },
        approvalStatus: "approved",
      }),
      Meeting.countDocuments({
        ...meetingRangeQuery,
        status: { $ne: "cancelled" },
        approvalStatus: "pending",
      }),
      PurchaseOrder.countDocuments(poRangeQuery),
      User.countDocuments(userBaseQuery),
      Meeting.find(meetingRangeQuery)
        .select("title startTime status approvalStatus createdBy")
        .populate("createdBy", "name email role subRole")
        .sort({ _id: -1 })
        .limit(5)
        .lean(),
      PurchaseOrder.find(poRangeQuery)
        .select("poNo companyName status activityStatus poDate")
        .sort({ _id: -1 })
        .limit(5)
        .lean(),
      Activity.find(activityRangeQuery)
        .populate("user", "name email role subRole")
        .sort({ _id: -1 })
        .limit(5)
        .lean(),
      Activity.find(activityRangeQuery)
        .sort({ _id: -1 })
        .populate("user", "name department role")
        .lean(),
      User.countDocuments(userBaseQuery),
      User.countDocuments(nonAdminBaseQuery),
    ]);

    const userMap = {};
    rangeActivities.forEach((a) => {
      const uid = String(a.user?._id || a.user);
      const role = a.user?.role;
      if (role && ["superadmin", "admin", "radmin"].includes(role)) return;
      if (!userMap[uid]) {
        userMap[uid] = { loginCount: 0, hasLogout: false };
      }
      userMap[uid].loginCount++;
      if (a.logoutTime) userMap[uid].hasLogout = true;
    });
    const rangePresent = Object.values(userMap).filter((u) => u.hasLogout).length;
    const rangePartial = Object.values(userMap).filter((u) => !u.hasLogout).length;
    const rangeAbsent = Math.max(nonAdminUsers - Object.keys(userMap).length, 0);

    return res.status(200).json({
      success: true,
      range: {
        fromDate: start,
        toDate: end,
      },
      stats: {
        meetingsScheduled,
        meetingsConfirmed,
        meetingsPending,
        currentMonthPOs,
        activeEmployees,
        todayAttendance: {
          present: rangePresent,
          partial: rangePartial,
          absent: rangeAbsent,
          total: nonAdminUsers,
        },
      },
      notifications: [],
    });
  } catch (error) {
    console.error("getAdminDashboard error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load admin dashboard",
    });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const department = getDepartmentFilter(req.user);
    const query =
      req.query.includeInactive === "true" ? {} : { status: { $ne: "inactive" } };
    if (department) {
      query.department = department;
    }
    const users = await User.find(query)
      .select("name email employeeId mobileNumber department designation managerName territory joiningDate dob username role subRole status isApprovedByAdmin deviceId createdAt")
      .sort({ _id: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getAdminUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load users",
    });
  }
};

export const createAdminUser = async (req, res) => {
  try {
    const {
      name,
      email,
      employeeId,
      mobileNumber,
      department,
      designation,
      managerName,
      territory,
      joiningDate,
      username,
      dob,
      role,
      subRole,
      pin,
      password,
      status,
    } = req.body;

    const resolvedUsername = username || employeeId;
    const resolvedPin = pin || password;

    if (
      !name ||
      !email ||
      !employeeId ||
      !mobileNumber ||
      !department ||
      !designation ||
      !joiningDate ||
      !resolvedUsername ||
      !dob ||
      !role ||
      !resolvedPin
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields are mandatory",
      });
    }

    const radminDepartment = getDepartmentFilter(req.user);
    if (radminDepartment && department.trim() !== radminDepartment) {
      return res.status(403).json({
        success: false,
        message: `You can only create users in the ${radminDepartment} department`,
      });
    }

    const allowedRoles = ["admin", "superadmin", "radmin", "subadmin", "sales_user", "purchase_user", "ppc_user"];
    const allowedSubRoles = [
      "",
      "sales_admin",
      "purchase_admin",
      "ppc_admin",
      "sales_manager",
      "po_manager",
      "ppc_manager",
      "hr_manager",
      "accounts_manager",
      "operations_manager",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role selected",
      });
    }

    if ((role === "subadmin" || role === "radmin") && !subRole) {
      return res.status(400).json({
        success: false,
        message: "Admin/Manager type is required",
      });
    }

    if (subRole && !allowedSubRoles.includes(subRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid manager role selected",
      });
    }

    if (String(resolvedPin).length < 4) {
      return res.status(400).json({
        success: false,
        message: "PIN must be at least 4 characters",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { employeeId: employeeId.trim() },
        { username: resolvedUsername.trim() },
      ],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email, employee ID, or username",
      });
    }

    const hashedDefaultPassword = await bcrypt.hash("123456", 10);
    const hashedPin = await bcrypt.hash(String(resolvedPin), 10);

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      employeeId: employeeId.trim(),
      mobileNumber: mobileNumber.trim(),
      department: department.trim(),
      designation: designation.trim(),
      managerName: managerName?.trim() || "",
      territory: territory?.trim() || "",
      joiningDate,
      username: resolvedUsername.trim(),
      dob,
      password: hashedDefaultPassword,
      role,
      subRole: (role === "subadmin" || role === "radmin") ? subRole : "",
      status: status || "approved",
      isApprovedByAdmin: true,
      pin: hashedPin,
    });

    const safeUser = await User.findById(user._id)
      .select("name email employeeId mobileNumber department designation managerName territory joiningDate dob username role subRole status isApprovedByAdmin")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Person added successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("createAdminUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add person",
    });
  }
};

export const getAdminHierarchy = async (req, res) => {
  try {
    const department = getDepartmentFilter(req.user);

    const userQuery = { status: { $ne: "inactive" } };
    if (department) {
      userQuery.department = department;
    }

    const users = await User.find(userQuery)
      .select("name email employeeId mobileNumber department designation managerName territory role subRole status")
      .sort({ role: 1, name: 1 })
      .lean();

    let allocations = await UserAllocation.find({ isActive: true })
      .populate("salesManager", "name email employeeId department designation subRole")
      .populate("salesUser", "name email employeeId department designation mobileNumber")
      .sort({ _id: -1 })
      .lean();

    if (department) {
      allocations = allocations.filter((a) => {
        const mgrDept = a.salesManager?.department;
        const usrDept = a.salesUser?.department;
        return mgrDept === department || usrDept === department;
      });
    }

    // Build manager → allocated users map
    const managerMap = {};
    const allocatedUserIds = new Set();
    allocations.forEach((a) => {
      const mgrId = String(a.salesManager?._id);
      if (!mgrId) return;
      if (!managerMap[mgrId]) {
        managerMap[mgrId] = {
          ...a.salesManager,
          id: mgrId,
          children: [],
        };
      }
      const userId = String(a.salesUser?._id);
      if (userId) {
        allocatedUserIds.add(userId);
        managerMap[mgrId].children.push({
          ...a.salesUser,
          id: userId,
        });
      }
    });

    const managerNodes = Object.values(managerMap);

    // Unallocated sales users (role sales_user, not in any allocation)
    const unallocatedUsers = users.filter((u) => 
      u.role === "sales_user" && !allocatedUserIds.has(String(u._id))
    ).map((u) => ({ ...u, id: String(u._id) }));

    return res.status(200).json({
      success: true,
      managerNodes,
      unallocatedUsers,
    });
  } catch (error) {
    console.error("getAdminHierarchy error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load hierarchy",
    });
  }
};

export const updateAdminUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["pending", "approved", "inactive"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status",
      });
    }

    const department = getDepartmentFilter(req.user);
    if (department) {
      const targetUser = await User.findById(req.params.id).select("department").lean();
      if (!targetUser || targetUser.department !== department) {
        return res.status(403).json({
          success: false,
          message: "You can only update users in your department",
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        status,
        isApprovedByAdmin: status === "approved",
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("name email employeeId mobileNumber department designation role subRole status isApprovedByAdmin")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      user,
    });
  } catch (error) {
    console.error("updateAdminUserStatus error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update user status",
    });
  }
};

export const approveAdminUser = async (req, res) => {
  try {
    const department = getDepartmentFilter(req.user);
    if (department) {
      const targetUser = await User.findById(req.params.id).select("department").lean();
      if (!targetUser || targetUser.department !== department) {
        return res.status(403).json({
          success: false,
          message: "You can only approve users in your department",
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        status: "approved",
        isApprovedByAdmin: true,
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("name email employeeId mobileNumber department designation role subRole status isApprovedByAdmin")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User approved successfully",
      user,
    });
  } catch (error) {
    console.error("approveAdminUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to approve user",
    });
  }
};

export const getAdminMeetings = async (req, res) => {
  try {
    const department = getDepartmentFilter(req.user);
    const query = {};

    if (department) {
      const deptUsers = await User.find({
        department,
        status: { $ne: "inactive" },
      })
        .select("_id")
        .lean();
      const deptUserIds = deptUsers.map((u) => u._id);
      query.createdBy = { $in: deptUserIds };
    }

    if (req.query.fromDate || req.query.toDate) {
      const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
      query.startTime = { $gte: start, $lte: end };
    }

    const meetings = await Meeting.find(query)
      .populate("createdBy", "name email employeeId department designation role subRole")
      .populate("cancelledBy", "name email")
      .populate("attendeeResponses.respondedBy", "name email")
      .sort({ _id: -1 })
      .lean();

    const meetingIds = meetings.filter(m => m._id).map(m => m._id);
    const reports = await MeetingReport.find({ meeting: { $in: meetingIds } })
      .sort({ _id: -1 })
      .populate("createdBy", "name email")
      .lean();
    const reportsByMeetingId = {};
    reports.forEach((r) => {
      const mid = String(r.meeting || "");
      if (mid) {
        if (!reportsByMeetingId[mid]) reportsByMeetingId[mid] = [];
        reportsByMeetingId[mid].push(r);
      }
    });
    const meetingsWithReports = meetings.map((m) => ({
      ...m,
      reports: reportsByMeetingId[String(m._id)] || [],
    }));

    return res.status(200).json({
      success: true,
      count: meetingsWithReports.length,
      meetings: meetingsWithReports,
    });
  } catch (error) {
    console.error("getAdminMeetings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load meetings",
    });
  }
};


// export const getAdminHierarchy = async (req, res) => {
//   try {
//     const users = await User.find({ status: { $ne: "inactive" } })
//       .select(
//         "name email employeeId mobileNumber department designation managerName territory role subRole status"
//       )
//       .sort({ name: 1 })
//       .lean();

//     const admins = users.filter((u) =>
//       ["admin", "superadmin"].includes(u.role)
//     );

//     const managers = users.filter((u) => u.role === "subadmin");

//     const normalUsers = users.filter((u) =>
//       ["sales_user", "purchase_user", "ppc_user"].includes(u.role)
//     );

//     const managerToUserRole = {
//       sales_manager: "sales_user",
//       po_manager: "purchase_user",
//       purchase_manager: "purchase_user",
//       ppc_manager: "ppc_user",
//     };

//     const tree = admins.map((admin) => ({
//       ...admin,
//       type: "admin",
//       children: managers.map((manager) => ({
//         ...manager,
//         type: "manager",
//         children: normalUsers.filter(
//           (user) => user.role === managerToUserRole[manager.subRole]
//         ),
//       })),
//     }));

//     return res.status(200).json({
//       success: true,
//       count: users.length,
//       tree,
//     });
//   } catch (error) {
//     console.error("getAdminHierarchy error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to load hierarchy",
//     });
//   }
// };

export const updateUserWorkingHours = async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const department = getDepartmentFilter(req.user);
    if (department && user.department !== department) {
      return res.status(403).json({
        success: false,
        message: "You can only update users in your department",
      });
    }

    if (startTime !== undefined) user.workingHours.startTime = startTime;
    if (endTime !== undefined) user.workingHours.endTime = endTime;

    await user.save();

    return res.json({ success: true, user });
  } catch (error) {
    console.error("updateUserWorkingHours error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to update working hours" });
  }
};

export const clearUserDevice = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const department = getDepartmentFilter(req.user);
    if (department && user.department !== department) {
      return res.status(403).json({
        success: false,
        message: "You can only manage users in your department",
      });
    }

    user.deviceId = "";
    await user.save();

    return res.json({ success: true, user });
  } catch (error) {
    console.error("clearUserDevice error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to clear device" });
  }
};
