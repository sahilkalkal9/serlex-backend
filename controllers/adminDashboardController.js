import Activity from "../models/Activity.js";
import bcrypt from "bcryptjs";
import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";

const getDateRange = (fromDate, toDate) => {
  const now = new Date();
  const start = fromDate
    ? new Date(fromDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = toDate
    ? new Date(toDate)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export const getAdminDashboard = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);

    const meetingRangeQuery = {
      startTime: { $gte: start, $lte: end },
    };

    const poRangeQuery = {
      poDate: { $gte: start, $lte: end },
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      meetingsScheduled,
      meetingsConfirmed,
      meetingsPending,
      currentMonthPOs,
      activeEmployees,
      recentMeetings,
      recentPOs,
      recentLogins,
      todayActivities,
      totalUsers,
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
      User.countDocuments({ status: { $ne: "inactive" } }),
      Meeting.find(meetingRangeQuery)
        .select("title startTime status approvalStatus createdBy")
        .populate("createdBy", "name email role subRole")
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      PurchaseOrder.find(poRangeQuery)
        .select("poNo companyName status activityStatus poDate")
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      Activity.find({
        loginTime: { $gte: start, $lte: end },
      })
        .populate("user", "name email role subRole")
        .sort({ loginTime: -1 })
        .limit(5)
        .lean(),
      Activity.find({
        loginTime: { $gte: todayStart, $lte: todayEnd },
      }).populate("user", "name department").lean(),
      User.countDocuments({ status: { $ne: "inactive" } }),
    ]);

    const notifications = [
      ...recentMeetings.map((meeting) => ({
        id: String(meeting._id),
        type: "meeting",
        title: meeting.title || "Meeting",
        meta: meeting.createdBy?.name || meeting.createdBy?.email || "Meeting",
        status: meeting.approvalStatus || meeting.status || "pending",
        time: meeting.startTime,
      })),
      ...recentPOs.map((po) => ({
        id: String(po._id),
        type: "po",
        title: po.poNo || "Purchase Order",
        meta: po.companyName || "PO",
        status: po.activityStatus || po.status || "Pending",
        time: po.poDate,
      })),
      ...recentLogins.map((activity) => ({
        id: String(activity._id),
        type: "login",
        title: activity.user?.name || activity.user?.email || "User login",
        meta: activity.loginLocation?.name || "Login activity",
        status: "active",
        time: activity.loginTime,
      })),
    ]
      .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
      .slice(0, 8);

    const todayUserMap = {};
    todayActivities.forEach((a) => {
      const uid = String(a.user?._id || a.user);
      if (!todayUserMap[uid]) {
        todayUserMap[uid] = { loginCount: 0, hasLogout: false, user: a.user };
      }
      todayUserMap[uid].loginCount++;
      if (a.logoutTime) todayUserMap[uid].hasLogout = true;
    });
    const todayPresent = Object.values(todayUserMap).filter((u) => u.hasLogout).length;
    const todayPartial = Object.values(todayUserMap).filter((u) => !u.hasLogout).length;
    const todayAbsent = Math.max(totalUsers - Object.keys(todayUserMap).length, 0);

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
          present: todayPresent,
          partial: todayPartial,
          absent: todayAbsent,
          total: totalUsers,
        },
      },
      notifications,
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
    const query =
      req.query.includeInactive === "true" ? {} : { status: { $ne: "inactive" } };
    const users = await User.find(query)
      .select("name email employeeId mobileNumber department designation managerName territory joiningDate dob username role subRole status isApprovedByAdmin")
      .sort({ name: 1 })
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
      status,
    } = req.body;

    if (
      !name ||
      !email ||
      !employeeId ||
      !mobileNumber ||
      !department ||
      !designation ||
      !joiningDate ||
      !username ||
      !dob ||
      !role ||
      !pin
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields are mandatory",
      });
    }

    const allowedRoles = ["admin", "subadmin", "sales_user", "purchase_user", "ppc_user"];
    const allowedSubRoles = [
      "",
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

    if (role === "subadmin" && !subRole) {
      return res.status(400).json({
        success: false,
        message: "Manager role is required",
      });
    }

    if (subRole && !allowedSubRoles.includes(subRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid manager role selected",
      });
    }

    if (String(pin).length < 4) {
      return res.status(400).json({
        success: false,
        message: "PIN must be at least 4 characters",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { employeeId: employeeId.trim() },
        { username: username.trim() },
      ],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email, employee ID, or username",
      });
    }

    const hashedDefaultPassword = await bcrypt.hash("123456", 10);
    const hashedPin = await bcrypt.hash(String(pin), 10);

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
      username: username.trim(),
      dob,
      password: hashedDefaultPassword,
      role,
      subRole: role === "subadmin" ? subRole : "",
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
    const users = await User.find({ status: { $ne: "inactive" } })
      .select("name email employeeId mobileNumber department designation managerName territory role subRole status")
      .sort({ role: 1, name: 1 })
      .lean();

    const admins = users.filter((user) => user.role === "admin" || user.role === "superadmin");
    const managers = users.filter((user) => user.role === "subadmin");
    const teamUsers = users.filter((user) => !["admin", "superadmin", "subadmin"].includes(user.role));

    const fallbackAdmin = admins[0] || {
      _id: "admin-root",
      name: "Admin",
      email: "",
      employeeId: "",
      mobileNumber: "",
      department: "Administration",
      designation: "Administrator",
      role: "admin",
      subRole: "",
      status: "approved",
    };

    const normalize = (user) => ({
      ...user,
      id: String(user._id || user.id),
      children: [],
    });

    const managerNodes = managers.map((manager) => {
      const managerName = (manager.name || "").toLowerCase();
      const department = manager.department || "";
      const subRoleDepartment = manager.subRole?.includes("sales")
        ? "Sales"
        : manager.subRole?.includes("po")
        ? "Purchase"
        : manager.subRole?.includes("ppc")
        ? "PPC"
        : "";

      return {
        ...normalize(manager),
        children: teamUsers
          .filter((member) => {
            const memberManager = (member.managerName || "").toLowerCase();
            return (
              (memberManager && memberManager === managerName) ||
              (department && member.department === department) ||
              (subRoleDepartment && member.department === subRoleDepartment)
            );
          })
          .map(normalize),
      };
    });

    const assignedUserIds = new Set(
      managerNodes.flatMap((manager) => manager.children.map((member) => String(member._id || member.id)))
    );
    const unassignedUsers = teamUsers
      .filter((member) => !assignedUserIds.has(String(member._id)))
      .map(normalize);

    const tree = admins.length
      ? admins.map((admin, index) => ({
          ...normalize(admin),
          children: index === 0 ? [...managerNodes, ...unassignedUsers] : [],
        }))
      : [{ ...normalize(fallbackAdmin), children: [...managerNodes, ...unassignedUsers] }];

    return res.status(200).json({
      success: true,
      tree,
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
    const query = {};

    if (req.query.fromDate || req.query.toDate) {
      const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
      query.startTime = { $gte: start, $lte: end };
    }

    const meetings = await Meeting.find(query)
      .populate("createdBy", "name email employeeId department designation role subRole")
      .populate("cancelledBy", "name email")
      .populate("attendeeResponses.respondedBy", "name email")
      .sort({ startTime: 1 })
      .lean();

    const meetingIds = meetings.filter(m => m._id).map(m => m._id);
    const reports = await MeetingReport.find({ meeting: { $in: meetingIds } })
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
