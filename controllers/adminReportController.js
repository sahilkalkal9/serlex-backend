import Activity from "../models/Activity.js";
import Lead from "../models/Lead.js";
import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SalesTarget from "../models/SalesTarget.js";
import User from "../models/User.js";
import UserAllocation from "../models/UserAllocation.js";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const dateQuery = (field, start, end) => ({ [field]: { $gte: start, $lte: end } });
const asId = (value) => (value?._id || value || "").toString();
const sum = (items, key) => items.reduce((total, item) => total + Number(item?.[key] || 0), 0);
const percent = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

const monthKey = (date) => {
  const current = new Date(date);
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  const [year, month] = key.split("-");
  return `${monthNames[Number(month) - 1]} '${String(year).slice(2)}`;
};

const getMonthKeys = (start, end) => {
  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
};

const userName = (user) => user?.name || user?.username || user?.email || "Unassigned";
const durationMs = (activity) =>
  activity.logoutTime && activity.loginTime
    ? Math.max(new Date(activity.logoutTime) - new Date(activity.loginTime), 0)
    : 0;

const formatHours = (milliseconds) => {
  const minutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
};

const dayLabel = (date) => `${monthNames[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}`;

const getDaySeries = (start, end) => {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end && days.length < 31) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

const getOptions = async () => {
  const users = (await User.find({ status: { $ne: "inactive" } })
    .select("name email employeeId mobileNumber department designation role subRole managerName workingHours")
    .sort({ name: 1 })
    .lean());
  const departments = [...new Set(users.map((user) => user.department).filter(Boolean))].sort();

  return {
    users,
    departments,
    salesManagers: users.filter((user) => user.subRole === "sales_manager"),
    salesUsers: users.filter((user) => user.role === "sales_user" && user.subRole !== "sales_manager"),
    teams: departments.map((department) => ({ id: department, name: department })),
  };
};

// Get allocated users for a manager using UserAllocation model
const getAllocatedUsersForManager = async (managerId) => {
  const allocations = await UserAllocation.find({
    salesManager: managerId,
    isActive: true,
  })
    .select("salesUser")
    .lean();

  return allocations.map((a) => asId(a.salesUser));
};

// Get manager -> team members mapping using both allocations and managerName field
const getManagerTeamMapping = async (selectedManagers, salesUsers) => {
  const managerTeamMap = {};

  for (const manager of selectedManagers) {
    // First, try to get allocated users
    const allocatedUserIds = await getAllocatedUsersForManager(manager._id);

    if (allocatedUserIds.length > 0) {
      managerTeamMap[asId(manager)] = allocatedUserIds;
    } else {
      // Fallback to managerName field for backward compatibility
      const mName = manager.name?.toLowerCase().trim();
      if (mName) {
        const members = salesUsers.filter(
          (u) => u.managerName?.toLowerCase().trim() === mName
        );
        if (members.length) {
          managerTeamMap[asId(manager)] = members.map(asId);
        }
      }
    }
  }

  return managerTeamMap;
};

const buildSalesData = async (start, end, filters = {}, currentUser = null) => {
  const { users, departments, salesManagers, salesUsers } = await getOptions();

  // Determine relevant users based on filters
  let selectedManagers = [];
  
  // If current user is a sales manager, restrict to their allocated users
  if (currentUser?.role === "subadmin" && currentUser?.subRole === "sales_manager") {
    const currentManagerId = currentUser._id;
    const allocatedUserIds = await getAllocatedUsersForManager(currentManagerId);
    
    // Restrict salesUsers to only allocated users
    const restrictedSalesUsers = salesUsers.filter((u) =>
      allocatedUserIds.includes(asId(u._id))
    );
    
    selectedManagers = [users.find((u) => asId(u) === asId(currentManagerId))].filter(Boolean);
    
    // Continue with restricted data
    const managerTeamMap = { [asId(currentManagerId)]: allocatedUserIds };
    const selectedManagerIds = selectedManagers.map((user) => user._id);
    const allTeamMemberIds = [...new Set(Object.values(managerTeamMap).flat())];
    const allSalesUserIds = restrictedSalesUsers.map(asId);
    const allRelevantIds = [...new Set([...allTeamMemberIds, ...selectedManagerIds, ...allSalesUserIds])];

    const monthKeys = getMonthKeys(start, end);
    const periodKeys = monthKeys;

    const [teamTargets, teamPos] = await Promise.all([
      allRelevantIds.length
        ? SalesTarget.find({ period: "Monthly", periodKey: { $in: periodKeys }, salesUser: { $in: allRelevantIds } })
            .populate("salesUser", "name department managerName").lean()
        : Promise.resolve([]),
      allRelevantIds.length
        ? PurchaseOrder.find({ ...dateQuery("poDate", start, end), createdBy: { $in: allRelevantIds } })
            .populate("createdBy", "name department managerName").lean()
        : Promise.resolve([]),
    ]);

    const monthly = monthKeys.map((key) => {
      const target = teamTargets.filter((item) => item.periodKey === key).reduce((total, item) => total + Number(item.targetAmount || 0), 0);
      const achieved = teamPos.filter((po) => monthKey(po.poDate) === key).reduce((total, po) => total + Number(po.poValue || 0), 0);
      return { key, label: monthLabel(key), target, achieved, achievement: percent(achieved, target) };
    });

    const poFields = (po) => ({
      _id: po._id,
      poNo: po.poNo,
      companyName: po.companyName,
      poValue: po.poValue,
      poDate: po.poDate,
      status: po.status,
      activityStatus: po.activityStatus,
      trackingStatus: po.trackingStatus,
      vendorName: po.vendorName || "",
      category: po.category || "",
    });

    const managerRows = selectedManagers.map((manager) => {
      const id = asId(manager);
      const memberIds = managerTeamMap[id] || [];
      const allIds = [...new Set([...memberIds, id])];
      const pos = teamPos.filter((po) => allIds.includes(asId(po.createdBy)));
      const target = teamTargets.filter((t) => allIds.includes(asId(t.salesUser))).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
      const achieved = pos.reduce((total, po) => total + Number(po.poValue || 0), 0);
      return {
        id,
        name: userName(manager),
        department: manager.department || "Sales",
        target,
        achieved,
        achievement: percent(achieved, target),
        variance: Math.max(target - achieved, 0),
        status: achieved >= target && target > 0 ? "Achieved" : "Behind",
        pos: pos.map(poFields),
      };
    });

    const teamRows = allTeamMemberIds.map((memberId) => {
      const user = restrictedSalesUsers.find((u) => asId(u._id) === memberId);
      const pos = teamPos.filter((po) => asId(po.createdBy) === memberId);
      const target = teamTargets.filter((t) => asId(t.salesUser) === memberId).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
      const achieved = pos.reduce((total, po) => total + Number(po.poValue || 0), 0);
      return {
        id: memberId,
        name: userName(user),
        department: user?.department || "Sales",
        managerName: selectedManagers[0]?.name || "Unknown",
        target,
        achieved,
        achievement: percent(achieved, target),
        variance: Math.max(target - achieved, 0),
        pos: pos.map(poFields),
      };
    }).filter((row) => row.target > 0 || row.achieved > 0);

    const monthlyTeam = monthly;
    const departmentRows = [];

    const totalTarget = teamTargets.reduce((total, t) => total + Number(t.targetAmount || 0), 0);
    const totalAchieved = teamPos.reduce((total, po) => total + Number(po.poValue || 0), 0);
    const avgAchievementPct = monthly.filter((m) => m.target > 0).length
      ? Math.round(monthly.filter((m) => m.target > 0).reduce((s, m) => s + m.achievement, 0) / monthly.filter((m) => m.target > 0).length)
      : 0;

    return {
      options: { ...(await getOptions()), salesManagers, salesUsers: restrictedSalesUsers },
      summary: {
        totalTarget,
        totalAchieved,
        variance: Math.max(totalTarget - totalAchieved, 0),
        achievementPercent: percent(totalAchieved, totalTarget),
        avgMonthlyAchievement: avgAchievementPct,
        totalManagers: managerRows.length,
        achievedManagers: managerRows.filter((r) => r.status === "Achieved").length,
      },
      monthly,
      monthlyTeam,
      quarterly: [0, 1, 2, 3].map((index) => {
        const slice = monthly.slice(index * 3, index * 3 + 3);
        if (!slice.length) return null;
        const target = sum(slice, "target");
        const achieved = sum(slice, "achieved");
        return { label: `Q${index + 1}`, target, achieved, achievement: percent(achieved, target) };
      }).filter(Boolean),
      managerRows,
      teamRows,
      departmentRows,
    };
  }
  
  if (filters.salesManager && filters.salesManager !== "all") {
    const picked = users.find((u) => asId(u) === filters.salesManager);
    if (picked) selectedManagers = [picked];
  } else {
    selectedManagers = salesManagers.filter((user) => {
      if (filters.department && filters.department !== "all" && user.department !== filters.department) return false;
      return true;
    });
  }

  // Get manager -> team members mapping using allocations (with fallback to managerName)
  const managerTeamMap = await getManagerTeamMapping(selectedManagers, salesUsers);
  const selectedManagerIds = selectedManagers.map((user) => user._id);
  const allTeamMemberIds = [...new Set(Object.values(managerTeamMap).flat())];
  // Include all sales users (even unassigned) + manager IDs to fetch all targets/POs
  const allSalesUserIds = salesUsers.map(asId);
  const allRelevantIds = [...new Set([...allTeamMemberIds, ...selectedManagerIds, ...allSalesUserIds])];

  const monthKeys = getMonthKeys(start, end);
  const periodKeys = monthKeys;

  // Fetch targets & POs for all relevant users (managers + their team members)
  const [teamTargets, teamPos] = await Promise.all([
    allRelevantIds.length
      ? SalesTarget.find({ period: "Monthly", periodKey: { $in: periodKeys }, salesUser: { $in: allRelevantIds } })
          .populate("salesUser", "name department managerName").lean()
      : Promise.resolve([]),
    allRelevantIds.length
      ? PurchaseOrder.find({ ...dateQuery("poDate", start, end), createdBy: { $in: allRelevantIds } })
          .populate("createdBy", "name department managerName").lean()
      : Promise.resolve([]),
  ]);

  // Overall monthly data (all team members combined)
  const monthly = monthKeys.map((key) => {
    const target = teamTargets.filter((item) => item.periodKey === key).reduce((total, item) => total + Number(item.targetAmount || 0), 0);
    const achieved = teamPos.filter((po) => monthKey(po.poDate) === key).reduce((total, po) => total + Number(po.poValue || 0), 0);
    return { key, label: monthLabel(key), target, achieved, achievement: percent(achieved, target) };
  });

  const poFields = (po) => ({
    _id: po._id,
    poNo: po.poNo,
    companyName: po.companyName,
    poValue: po.poValue,
    poDate: po.poDate,
    status: po.status,
    activityStatus: po.activityStatus,
    trackingStatus: po.trackingStatus,
    vendorName: po.vendorName || "",
    category: po.category || "",
  });

  // Manager rows = each manager's team aggregated data + manager's own data
  const managerRows = selectedManagers.map((manager) => {
    const id = asId(manager);
    const memberIds = managerTeamMap[id] || [];
    const allIds = [...new Set([...memberIds, id])];
    const pos = teamPos.filter((po) => allIds.includes(asId(po.createdBy)));
    const target = teamTargets.filter((t) => allIds.includes(asId(t.salesUser))).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
    const achieved = pos.reduce((total, po) => total + Number(po.poValue || 0), 0);
    return {
      id,
      name: userName(manager),
      department: manager.department || "Sales",
      target,
      achieved,
      achievement: percent(achieved, target),
      variance: Math.max(target - achieved, 0),
      status: achieved >= target && target > 0 ? "Achieved" : "Behind",
      pos: pos.map(poFields),
    };
  });

  // Team rows = individual team members (sales users) under each manager + unassigned users
  const mappedTeamIds = new Set(Object.values(managerTeamMap).flat());
  const teamRows = [
    ...selectedManagers.flatMap((manager) => {
      const id = asId(manager);
      const memberIds = managerTeamMap[id] || [];
      return memberIds.map((memberId) => {
        const user = salesUsers.find((u) => asId(u) === memberId);
        const pos = teamPos.filter((po) => asId(po.createdBy) === memberId);
        const target = teamTargets.filter((t) => asId(t.salesUser) === memberId).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
        const achieved = pos.reduce((total, po) => total + Number(po.poValue || 0), 0);
        return {
          id: memberId,
          name: userName(user),
          department: user?.department || "Sales",
          managerName: manager.name,
          target,
          achieved,
          achievement: percent(achieved, target),
          variance: Math.max(target - achieved, 0),
          pos: pos.map(poFields),
        };
      });
    }),
    // Also include unassigned sales users (not under any manager) who have data
    ...salesUsers.filter((u) => !mappedTeamIds.has(asId(u))).map((user) => {
      const uid = asId(user);
      const pos = teamPos.filter((po) => asId(po.createdBy) === uid);
      const target = teamTargets.filter((t) => asId(t.salesUser) === uid).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
      const achieved = pos.reduce((total, po) => total + Number(po.poValue || 0), 0);
      return {
        id: uid,
        name: userName(user),
        department: user?.department || "Sales",
        managerName: "-",
        target,
        achieved,
        achievement: percent(achieved, target),
        variance: Math.max(target - achieved, 0),
        pos: pos.map(poFields),
      };
    }),
  ].filter((row) => row.target > 0 || row.achieved > 0);

  // Monthly team data = same as overall monthly (team members are the data source)
  const monthlyTeam = monthly;

  // Department rows from all relevant users (managers + team members)
  const departmentRows = departments.map((department) => {
    const deptUserIds = users.filter((user) => user.department === department).map(asId).filter((id) => allRelevantIds.includes(id));
    const target = teamTargets.filter((item) => deptUserIds.includes(asId(item.salesUser))).reduce((total, t) => total + Number(t.targetAmount || 0), 0);
    const achieved = teamPos.filter((po) => deptUserIds.includes(asId(po.createdBy))).reduce((total, po) => total + Number(po.poValue || 0), 0);
    return { department, target, achieved, achievement: percent(achieved, target), variance: Math.max(target - achieved, 0) };
  }).filter((row) => row.target || row.achieved);

  const totalTarget = teamTargets.reduce((total, t) => total + Number(t.targetAmount || 0), 0);
  const totalAchieved = teamPos.reduce((total, po) => total + Number(po.poValue || 0), 0);
  const avgAchievementPct = monthly.filter((m) => m.target > 0).length
    ? Math.round(monthly.filter((m) => m.target > 0).reduce((s, m) => s + m.achievement, 0) / monthly.filter((m) => m.target > 0).length)
    : 0;

  return {
    options: { ...(await getOptions()), salesManagers, salesUsers },
    summary: {
      totalTarget,
      totalAchieved,
      variance: Math.max(totalTarget - totalAchieved, 0),
      achievementPercent: percent(totalAchieved, totalTarget),
      avgMonthlyAchievement: avgAchievementPct,
      totalManagers: managerRows.length,
      achievedManagers: managerRows.filter((r) => r.status === "Achieved").length,
    },
    monthly,
    monthlyTeam,
    quarterly: [0, 1, 2, 3].map((index) => {
      const slice = monthly.slice(index * 3, index * 3 + 3);
      if (!slice.length) return null;
      const target = sum(slice, "target");
      const achieved = sum(slice, "achieved");
      return { label: `Q${index + 1}`, target, achieved, achievement: percent(achieved, target) };
    }).filter(Boolean),
    managerRows,
    teamRows,
    departmentRows,
  };
};

export const getAdminReportsOverview = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const [options, poCount, usersCount, activitiesCount, meetingsCount, meetingReportsCount, targetsCount] = await Promise.all([
      getOptions(),
      PurchaseOrder.countDocuments(dateQuery("poDate", start, end)),
      User.countDocuments({ status: { $ne: "inactive" } }),
      Activity.countDocuments(dateQuery("loginTime", start, end)),
      Meeting.countDocuments(dateQuery("startTime", start, end)),
      MeetingReport.countDocuments(dateQuery("meetingDateTime", start, end)),
      SalesTarget.countDocuments({ createdAt: { $lte: end } }),
    ]);

    const categories = [
      ["sales", "Sales Reports", "View sales report month wise.", Math.max(targetsCount, 1)],
      ["po", "PO Reports", "View and export current, completed and delivered PO reports.", Math.max(poCount, 1)],
      ["attendance", "Attendance Reports", "View attendance, leave and present reports.", Math.max(usersCount, 1)],
      ["login-logout", "Login / Logout Reports", "View login and logout activity reports.", Math.max(activitiesCount, 1)],
      ["meetings", "Meeting Reports", "View meeting summary and participation reports.", Math.max(meetingsCount + meetingReportsCount, 1)],
      ["other", "Other Reports", "View additional system and activity reports.", Math.max(activitiesCount + meetingsCount, 1)],
      ["target-achievement", "Target vs Achievement Reports", "View target vs achievement quarterly basis.", Math.max(targetsCount, 1)],
    ];

    return res.json({
      success: true,
      options,
      categories: categories.map(([id, title, description, count]) => ({ id, title, description, count })),
      reports: categories.map(([id, title, description], index) => ({
        id,
        name: `${title.replace("Reports", "Report").trim()}${id === "sales" ? " (Month Wise)" : ""}`,
        category: title,
        description,
        frequency: index === 3 ? "Daily" : index === 6 ? "Quarterly" : "Monthly",
        lastGeneratedOn: new Date(),
      })),
    });
  } catch (error) {
    console.error("getAdminReportsOverview error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load reports" });
  }
};

export const getAdminSalesReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const data = await buildSalesData(start, end, req.query, req.user);
    return res.json({ success: true, ...data });
  } catch (error) {
    console.error("getAdminSalesReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load sales report" });
  }
};

export const getAdminTargetAchievementReport = getAdminSalesReport;

export const getAdminLoginLogoutReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const options = await getOptions();
    const selectedUsers = options.users.filter((user) => {
      if (req.query.department && req.query.department !== "all" && user.department !== req.query.department) return false;
      if (req.query.role && req.query.role !== "all" && user.role !== req.query.role) return false;
      if (req.query.employee && req.query.employee !== "all" && asId(user) !== req.query.employee) return false;
      return true;
    });

    // If sales manager, only show allocated users
    let finalUsers = selectedUsers;
    if (req.user?.role === "subadmin" && req.user?.subRole === "sales_manager") {
      const allocatedUserIds = await getAllocatedUsersForManager(req.user.id || req.user._id);
      finalUsers = selectedUsers.filter((user) => allocatedUserIds.includes(asId(user)));
    }

    const selectedIds = finalUsers.map((user) => user._id);
    const activities = await Activity.find({
      ...dateQuery("loginTime", start, end),
      user: { $in: selectedIds },
    }).sort({ _id: -1 }).populate("user", "name department designation").lean();

    const totalLogins = activities.length;
    const totalLogouts = activities.filter((activity) => activity.logoutTime).length;
    const totalDurationMs = activities.reduce((total, activity) => total + durationMs(activity), 0);
    const uniqueUsers = new Set(activities.map((activity) => asId(activity.user))).size;
    const activeUserIds = new Set(
      activities
        .filter((activity) => !activity.logoutTime)
        .map((activity) => asId(activity.user))
    );
    const activeUsers = activeUserIds.size;
    const avgSessionMs = totalLogouts ? totalDurationMs / totalLogouts : 0;
    const daySeries = getDaySeries(start, end).map((date) => {
      const dayActivities = activities.filter((activity) => new Date(activity.loginTime).toDateString() === date.toDateString());
      return {
        label: dayLabel(date),
        logins: dayActivities.length,
        logouts: dayActivities.filter((activity) => activity.logoutTime).length,
        activeHours: Math.round(dayActivities.reduce((total, activity) => total + durationMs(activity), 0) / 3600000),
      };
    });

    const userRows = selectedUsers.map((user) => {
      const rows = activities.filter((activity) => asId(activity.user) === asId(user));
      const userDuration = rows.reduce((total, activity) => total + durationMs(activity), 0);
      return {
        id: asId(user),
        name: userName(user),
        department: user.department || "General",
        role: user.role || "",
        subRole: user.subRole || "",
        designation: user.designation || "",
        totalLogins: rows.length,
        totalLogouts: rows.filter((activity) => activity.logoutTime).length,
        activeHours: formatHours(userDuration),
        activeHoursValue: Math.round(userDuration / 3600000),
        avgSessionDuration: formatHours(rows.length ? userDuration / rows.length : 0),
        activeUsers: rows.length ? 1 : 0,
        activities: rows
          .slice()
          .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime))
          .map((a) => ({
            loginTime: a.loginTime,
            logoutTime: a.logoutTime,
            loginLocation: a.loginLocation,
            logoutLocation: a.logoutLocation,
          })),
      };
    }).filter((row) => row.totalLogins || row.totalLogouts);

    const departmentRows = options.departments.map((department) => {
      const rows = activities.filter((activity) => activity.user?.department === department);
      const deptDuration = rows.reduce((total, activity) => total + durationMs(activity), 0);
      const deptUsers = new Set(rows.map((activity) => asId(activity.user)));
      const deptActiveUsers = new Set(
        rows
          .filter((activity) => !activity.logoutTime)
          .map((activity) => asId(activity.user))
      );
      return {
        department,
        totalLogins: deptUsers.size,
        totalLogouts: rows.filter((activity) => activity.logoutTime).length,
        activeHours: formatHours(deptDuration),
        avgSessionDuration: formatHours(rows.length ? deptDuration / rows.length : 0),
        activeUsers: deptActiveUsers.size,
      };
    }).filter((row) => row.totalLogins || row.totalLogouts);

    const timeRanges = [
      { label: "Before 9 AM", match: (hour) => hour < 9 },
      { label: "9 AM - 11 AM", match: (hour) => hour >= 9 && hour < 11 },
      { label: "11 AM - 1 PM", match: (hour) => hour >= 11 && hour < 13 },
      { label: "1 PM - 3 PM", match: (hour) => hour >= 13 && hour < 15 },
      { label: "After 3 PM", match: (hour) => hour >= 15 },
    ];

    const allLoginTimes = activities.map((a) => new Date(a.loginTime)).filter(Boolean).sort((a, b) => a - b);
    const firstLoginTime = allLoginTimes.length ? allLoginTimes[0] : null;
    const lastLoginTime = allLoginTimes.length ? allLoginTimes[allLoginTimes.length - 1] : null;

    const locationMap = {};
    activities.forEach((a) => {
      const name = a.loginLocation?.name || "Unknown";
      if (!locationMap[name]) locationMap[name] = 0;
      locationMap[name]++;
    });
    const totalWithLocation = activities.length;
    const locationRows = Object.entries(locationMap)
      .map(([label, count]) => ({ label, count, share: percent(count, totalWithLocation) }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      success: true,
      options,
      summary: {
        totalLogins,
        memberLogins: uniqueUsers,
        totalLogouts,
        totalActiveHours: formatHours(totalDurationMs),
        activeUsers,
        avgSessionDuration: formatHours(avgSessionMs),
        loginSuccessRate: percent(totalLogouts, totalLogins),
        firstLoginTime,
        lastLoginTime,
      },
      daily: daySeries,
      topUsers: userRows.sort((a, b) => b.activeHoursValue - a.activeHoursValue).slice(0, 5),
      userRows,
      departmentRows,
      loginDistribution: timeRanges.map((range) => {
        const count = activities.filter((activity) => range.match(new Date(activity.loginTime).getHours())).length;
        return { label: range.label, count, share: percent(count, totalLogins) };
      }),
      deviceRows: [
        { label: "Desktop", share: 72.41 },
        { label: "Mobile", share: 21.35 },
        { label: "Tablet", share: 6.24 },
      ],
      locationRows,
    });
  } catch (error) {
    console.error("getAdminLoginLogoutReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load login logout report" });
  }
};

export const getAdminMeetingAnalyticsReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const options = await getOptions();
    const meetings = await Meeting.find(dateQuery("startTime", start, end))
      .sort({ _id: -1 })
      .populate("createdBy", "name department designation")
      .lean();
    const totalMeetings = meetings.length;
    const clientMeetings = meetings.filter((m) => m.meetingType === "client").length;
    const teamMeetings = meetings.filter((m) => m.meetingType === "team").length;
    const totalDurationMs = meetings.reduce((t, m) => t + Math.max(new Date(m.endTime) - new Date(m.startTime), 0), 0);
    const monthKeys = getMonthKeys(start, end);
    const upcoming = meetings.filter((m) => m.status === "upcoming" || m.status === "ongoing").length;

    const monthly = monthKeys.map((key) => {
      const rows = meetings.filter((m) => monthKey(m.startTime) === key);
      const team = rows.filter((m) => m.meetingType === "team").length;
      const client = rows.filter((m) => m.meetingType === "client").length;
      const completed = rows.filter((m) => m.status === "completed").length;
      const cancelled = rows.filter((m) => m.status === "cancelled").length;
      return { label: monthLabel(key), team, client, total: rows.length, completed, cancelled };
    });

    const departmentRows = options.departments.map((department) => {
      const rows = meetings.filter((m) => m.createdBy?.department === department);
      const team = rows.filter((m) => m.meetingType === "team").length;
      const client = rows.filter((m) => m.meetingType === "client").length;
      return { department, meetings: rows.length, team, client, share: percent(rows.length, totalMeetings) };
    }).filter((row) => row.meetings);

    const employeeMap = new Map();
    meetings.forEach((meeting) => {
      const id = asId(meeting.createdBy) || "unassigned";
      const duration = Math.max(new Date(meeting.endTime) - new Date(meeting.startTime), 0);
      const row = employeeMap.get(id) || {
        id, name: userName(meeting.createdBy),
        teamMeetings: 0, clientMeetings: 0, totalMeetings: 0, totalDurationMs: 0,
      };
      if (meeting.meetingType === "team") row.teamMeetings += 1;
      if (meeting.meetingType === "client") row.clientMeetings += 1;
      row.totalMeetings += 1;
      row.totalDurationMs += duration;
      employeeMap.set(id, row);
    });
    const employeeRows = [...employeeMap.values()]
      .map((row) => ({
        ...row,
        totalHours: formatHours(row.totalDurationMs),
        avgDuration: formatHours(row.totalMeetings ? row.totalDurationMs / row.totalMeetings : 0),
      }))
      .sort((a, b) => b.totalMeetings - a.totalMeetings);

    const teamRows = options.departments.map((department) => {
      const rows = meetings.filter((m) => m.createdBy?.department === department);
      const deptTeam = rows.filter((m) => m.meetingType === "team").length;
      const deptClient = rows.filter((m) => m.meetingType === "client").length;
      const deptDuration = rows.reduce((t, m) => t + Math.max(new Date(m.endTime) - new Date(m.startTime), 0), 0);
      return {
        team: `${department} Team`,
        teamMeetings: deptTeam,
        clientMeetings: deptClient,
        totalMeetings: rows.length,
        totalHours: formatHours(deptDuration),
        avgDuration: formatHours(rows.length ? deptDuration / rows.length : 0),
      };
    }).filter((row) => row.totalMeetings);

    const typeRows = [
      { label: "Team Meeting", meetings: teamMeetings, share: percent(teamMeetings, totalMeetings) },
      { label: "Client Meeting", meetings: clientMeetings, share: percent(clientMeetings, totalMeetings) },
    ];

    const statusRows = [
      { label: "Upcoming", count: upcoming, share: percent(upcoming, totalMeetings) },
      { label: "Completed", count: meetings.filter((m) => m.status === "completed").length, share: meetings.length ? percent(meetings.filter((m) => m.status === "completed").length, totalMeetings) : 0 },
      { label: "Cancelled", count: meetings.filter((m) => m.status === "cancelled").length, share: meetings.length ? percent(meetings.filter((m) => m.status === "cancelled").length, totalMeetings) : 0 },
    ];

    const completedCount = meetings.filter((m) => m.status === "completed").length;
    const cancelledCount = meetings.filter((m) => m.status === "cancelled").length;

    const leads = await Lead.find(dateQuery("createdAt", start, end))
      .populate("meetingId", "title startTime endTime createdBy")
      .populate("followUps", "title startTime endTime status meetingType createdBy")
      .sort({ _id: -1 })
      .lean();

    const leadIds = leads.map((l) => l.leadId).filter(Boolean);
    const allMeetingIds = leads.flatMap((l) => [l.meetingId?._id, ...(l.followUps || []).map((f) => f._id)]).filter(Boolean);
    const leadReports = await MeetingReport.find({ leadId: { $in: leadIds } })
      .populate("createdBy", "name")
      .populate("meeting", "title startTime endTime")
      .sort({ _id: -1 })
      .lean();

    const reportsByLeadId = {};
    leadReports.forEach((r) => {
      const id = r.leadId;
      if (!reportsByLeadId[id]) reportsByLeadId[id] = [];
      reportsByLeadId[id].push(r);
    });

    const leadRows = leads.map((l) => {
      const reports = reportsByLeadId[l.leadId] || [];
      const latestReport = reports[0] || null;
      const followUpMeetings = (l.followUps || []).map((f) => ({
        _id: f._id,
        title: f.title,
        startTime: f.startTime,
        endTime: f.endTime,
        status: f.status,
        meetingType: f.meetingType,
        createdBy: userName(f.createdBy),
      }));
      return {
        _id: l._id,
        leadId: l.leadId,
        companyName: l.companyName || "-",
        contactPerson: l.contactPerson || "-",
        status: l.status,
        originalMeetingTitle: l.meetingId?.title || "N/A",
        originalMeetingDate: l.meetingId?.startTime,
        followUpCount: followUpMeetings.length,
        followUpMeetings,
        reports: reports.map((r) => ({
          _id: r._id,
          meetingTitle: r.meeting?.title || "N/A",
          meetingDate: r.meeting?.startTime,
          reportType: r.reportType,
          leadStatus: r.leadStatus || "-",
          expectedDealValue: r.expectedDealValue || 0,
          meetingPurpose: r.meetingPurpose || "-",
          meetingPoints: r.meetingPoints || "-",
          notes: r.notes || "-",
          createdBy: userName(r.createdBy),
          poReceived: r.poReceived,
          purchaseOrderNumber: r.purchaseOrderNumber || "-",
        })),
        latestLeadStatus: latestReport?.leadStatus || "-",
        latestDealValue: latestReport?.expectedDealValue || 0,
      };
    });

    return res.json({
      success: true,
      options,
      summary: {
        totalMeetings,
        teamMeetings,
        clientMeetings,
        totalMeetingHours: formatHours(totalDurationMs),
        avgMeetingDuration: formatHours(totalMeetings ? totalDurationMs / totalMeetings : 0),
        scheduled: totalMeetings - cancelledCount,
        completed: completedCount,
        cancelled: cancelledCount,
        upcoming,
        completionRate: percent(completedCount, totalMeetings - cancelledCount || totalMeetings),
        totalLeads: leads.length,
        activeLeads: leads.filter((l) => l.status === "active").length,
        convertedLeads: leads.filter((l) => l.status === "converted").length,
      },
      monthly,
      departmentRows,
      employeeRows,
      teamRows,
      typeRows,
      statusRows,
      leadRows,
    });
  } catch (error) {
    console.error("getAdminMeetingAnalyticsReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load meeting report" });
  }
};

export const getAdminPoReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const options = await getOptions();
    const query = dateQuery("poDate", start, end);
    if (req.query.salesManager && req.query.salesManager !== "all") {
      query.createdBy = req.query.salesManager;
    } else if (req.query.department && req.query.department !== "all") {
      const ids = options.users.filter((user) => user.department === req.query.department).map((user) => user._id);
      query.createdBy = { $in: ids };
    }

    const purchaseOrders = await PurchaseOrder.find(query).sort({ _id: -1 }).populate("createdBy", "name department managerName").lean();
    const monthKeys = getMonthKeys(start, end);
    const received = purchaseOrders.length;
    const completed = purchaseOrders.filter((po) => ["Completed", "Payment Received"].includes(po.activityStatus) || po.status === "Completed").length;
    const delivered = purchaseOrders.filter((po) => ["Delivered", "Completed", "Payment Received"].includes(po.activityStatus)).length;
    const delayed = purchaseOrders.filter((po) => po.activityStatus === "Delayed" || po.processingStatus === "Delayed").length;

    const monthly = monthKeys.map((key) => {
      const pos = purchaseOrders.filter((po) => monthKey(po.poDate) === key);
      const delayedCount = pos.filter((po) => po.activityStatus === "Delayed" || po.processingStatus === "Delayed").length;
      return {
        label: monthLabel(key),
        received: pos.length,
        completed: pos.filter((po) => ["Completed", "Payment Received"].includes(po.activityStatus) || po.status === "Completed").length,
        delivered: pos.filter((po) => ["Delivered", "Completed", "Payment Received"].includes(po.activityStatus)).length,
        delayed: delayedCount,
        delayPercent: percent(delayedCount, pos.length),
      };
    });

    const managerMap = new Map();
    purchaseOrders.forEach((po) => {
      const id = asId(po.createdBy) || "unassigned";
      const row = managerMap.get(id) || { id, name: userName(po.createdBy), months: {}, received: 0, completed: 0, delivered: 0 };
      const key = monthKey(po.poDate);
      row.months[key] = (row.months[key] || 0) + 1;
      row.received += 1;
      if (["Completed", "Payment Received"].includes(po.activityStatus) || po.status === "Completed") row.completed += 1;
      if (["Delivered", "Completed", "Payment Received"].includes(po.activityStatus)) row.delivered += 1;
      managerMap.set(id, row);
    });

    const managerRows = [...managerMap.values()];
    return res.json({
      success: true,
      options,
      summary: { received, completed, delivered, delayed, onTimeDelivery: percent(Math.max(0, delivered - delayed), delivered) },
      monthly,
      managerRows,
      comparisonRows: managerRows.map((row) => ({
        ...row,
        receivedShare: percent(row.received, received),
        completedShare: percent(row.completed, completed),
        deliveredShare: percent(row.delivered, delivered),
      })),
    });
  } catch (error) {
    console.error("getAdminPoReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load PO report" });
  }
};

export const getAdminAttendanceReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const options = await getOptions();
    let users = options.users.filter((user) => !req.query.department || req.query.department === "all" || user.department === req.query.department);
    if (req.query.role && req.query.role !== "all") {
      users = users.filter((user) => user.role === req.query.role);
    }
    if (req.query.employee && req.query.employee !== "all") {
      users = users.filter((user) => asId(user) === req.query.employee);
    }

    // If sales manager, only show allocated users
    if (req.user?.role === "subadmin" && req.user?.subRole === "sales_manager") {
      const allocatedUserIds = await getAllocatedUsersForManager(req.user.id || req.user._id);
      users = users.filter((user) => allocatedUserIds.includes(asId(user)));
    }

    const selectedIds = users.map((user) => user._id);
    const activities = await Activity.find({
      ...dateQuery("loginTime", start, end),
      user: { $in: selectedIds },
    }).populate("user", "name department").sort({ _id: -1 }).lean();

    const meetings = await Meeting.find({
      createdBy: { $in: selectedIds },
      ...dateQuery("startTime", start, end),
    }).select("createdBy title startTime endTime startLocation endLocation location meetingType status").lean();

    const dayCount = Math.max(Math.ceil((end - start) / 86400000), 1);

    const getDateStr = (d) => {
      const date = new Date(d);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };

    const userMap = {};
    users.forEach((u) => { userMap[asId(u)] = u; });

    const userDayMap = {};
    activities.forEach((activity) => {
      const uid = asId(activity.user);
      const day = getDateStr(activity.loginTime);
      const key = `${uid}_${day}`;
      const u = userMap[uid];
      const wh = u?.workingHours || { startTime: "10:00", endTime: "18:00" };
      const startMins = wh.startTime.split(":").map(Number);
      const loginMins = [new Date(activity.loginTime).getHours(), new Date(activity.loginTime).getMinutes()];
      const isLate = loginMins[0] > startMins[0] || (loginMins[0] === startMins[0] && loginMins[1] > startMins[1]);

      if (!userDayMap[key]) {
        userDayMap[key] = { userId: uid, userName: userName(activity.user), department: activity.user?.department || "-", day, loginTime: activity.loginTime, logoutTime: null, loginLocation: activity.loginLocation, logoutLocation: activity.logoutLocation, isLate };
      }
      if (activity.logoutTime && (!userDayMap[key].logoutTime || new Date(activity.logoutTime) > new Date(userDayMap[key].logoutTime))) {
        userDayMap[key].logoutTime = activity.logoutTime;
        userDayMap[key].logoutLocation = activity.logoutLocation;
      }
      if (!userDayMap[key].loginLocation?.name && activity.loginLocation?.name) {
        userDayMap[key].loginLocation = activity.loginLocation;
      }
    });

    Object.values(userDayMap).forEach((entry) => {
      if (entry.loginTime && entry.logoutTime) {
        const u = userMap[entry.userId];
        const wh = u?.workingHours || { startTime: "10:00", endTime: "18:00" };
        const startMins = wh.startTime.split(":").map(Number);
        const endMins = wh.endTime.split(":").map(Number);
        const loginMins = [new Date(entry.loginTime).getHours(), new Date(entry.loginTime).getMinutes()];
        const logoutMins = [new Date(entry.logoutTime).getHours(), new Date(entry.logoutTime).getMinutes()];
        const loginBeforeStart = loginMins[0] < startMins[0] || (loginMins[0] === startMins[0] && loginMins[1] <= startMins[1]);
        const logoutBeforeEnd = logoutMins[0] < endMins[0] || (logoutMins[0] === endMins[0] && logoutMins[1] < endMins[1]);
        entry.isLate = !loginBeforeStart;
        entry.isHalfDay = logoutBeforeEnd;
      } else {
        entry.isLate = false;
        entry.isHalfDay = false;
      }
    });

    const dayKeys = Array.from({ length: dayCount }).slice(0, 31).map((_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return getDateStr(date);
    });

    const isSunday = (dateStr) => new Date(dateStr).getDay() === 0;
    const workingDayKeys = dayKeys.filter((day) => !isSunday(day));
    const weekOffCount = dayKeys.length - workingDayKeys.length;

    const employeeMap = {};
    Object.values(userDayMap).forEach((entry) => {
      const uid = entry.userId;
      if (!employeeMap[uid]) employeeMap[uid] = { userId: uid, name: entry.userName, department: entry.department, days: {} };
      employeeMap[uid].days[entry.day] = entry;
    });

    let totalPresent = 0;
    let totalPartial = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalHalfDay = 0;

    const daily = dayKeys.map((day) => {
      let presentCount = 0;
      let partialCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let halfDayCount = 0;

      users.forEach((user) => {
        const uid = asId(user);
        const key = `${uid}_${day}`;
        const entry = userDayMap[key];
        if (entry) {
          const hasLoginOnSameDay = entry.loginTime && getDateStr(entry.loginTime) === day;
          if (hasLoginOnSameDay) {
            presentCount++;
            if (entry.isLate) lateCount++;
            if (entry.isHalfDay) halfDayCount++;
          }
        } else {
          absentCount++;
        }
      });

      if (!isSunday(day)) {
        totalPresent += presentCount;
        totalPartial += partialCount;
        totalLate += lateCount;
        totalAbsent += absentCount;
        totalHalfDay += halfDayCount;
      }

      return {
        label: dayLabel(new Date(day)),
        isWeekOff: isSunday(day),
        present: percent(presentCount, users.length),
        absent: percent(absentCount, users.length),
        partial: percent(partialCount, users.length),
        late: percent(lateCount, users.length),
        halfDay: percent(halfDayCount, users.length),
        presentCount,
        absentCount,
        partialCount,
        lateCount,
        halfDayCount,
      };
    });

    const totalWorkingDays = users.length * workingDayKeys.length;

    const departmentRows = options.departments
      .filter((dept) => users.some((user) => user.department === dept))
      .map((department) => {
      const deptUsers = users.filter((user) => user.department === department);
      let deptPresent = 0;
      let deptPartial = 0;
      Object.values(userDayMap).forEach((entry) => {
        if (entry.department === department) {
          const hasLogout = !!entry.logoutTime;
          const hasLoginOnSameDay = entry.loginTime && getDateStr(entry.loginTime) === entry.day;
          if (hasLogout) {
            deptPresent++;
          } else if (hasLoginOnSameDay) {
            deptPartial++;
          }
        }
      });
      const totalCount = deptUsers.length * workingDayKeys.length;
      const deptAbsent = Math.max(totalCount - deptPresent - deptPartial, 0);
      return {
        department,
        present: percent(deptPresent, Math.max(totalCount, 1)),
        partial: percent(deptPartial, Math.max(totalCount, 1)),
        absent: percent(deptAbsent, Math.max(totalCount, 1)),
        presentCount: deptPresent,
        partialCount: deptPartial,
        totalCount,
      };
    });

    const employeeRows = users.map((user) => {
      const uid = asId(user);
      const emp = employeeMap[uid];
      let presentDays = 0;
      let partialDays = 0;
      let lateDays = 0;
      let absentDays = 0;
      let halfDays = 0;

      workingDayKeys.forEach((day) => {
        const key = `${uid}_${day}`;
        const entry = userDayMap[key];
        if (entry) {
          const hasLoginOnSameDay = entry.loginTime && getDateStr(entry.loginTime) === day;
          if (hasLoginOnSameDay) {
            presentDays++;
            if (entry.isLate) lateDays++;
            if (entry.isHalfDay) halfDays++;
          }
        } else {
          absentDays++;
        }
      });

      const activitiesList = activities.filter((a) => asId(a.user) === uid);
      const firstLogin = activitiesList.length ? activitiesList[0].loginTime : null;
      const lastLogout = activitiesList.length ? activitiesList[activitiesList.length - 1].logoutTime : null;
      const userMeetings = meetings.filter((m) => asId(m.createdBy) === uid);

      return {
        id: uid,
        name: userName(user),
        department: user.department || "-",
        employeeId: user.employeeId || "-",
        mobileNumber: user.mobileNumber || "-",
        email: user.email || "-",
        designation: user.designation || "-",
        workingDays: workingDayKeys.length,
        presentDays,
        partialDays,
        absentDays,
        lateDays,
        halfDays,
        leaveDays: 0,
        workingHours: user.workingHours || { startTime: "10:00", endTime: "18:00" },
        attendancePercent: percent(presentDays - halfDays * 0.5, workingDayKeys.length),
        firstLogin,
        lastLogout,
        totalMeetings: userMeetings.length,
        meetingsWithLocation: userMeetings.filter((m) => m.startLocation?.lat).length,
        activities: (activitiesList || []).map((a) => {
          const dayKey = `${uid}_${getDateStr(a.loginTime)}`;
          const dayEntry = userDayMap[dayKey];
          return {
            loginTime: a.loginTime,
            logoutTime: a.logoutTime,
            loginLocation: a.loginLocation,
            logoutLocation: a.logoutLocation,
            isLate: dayEntry?.isLate || false,
            isHalfDay: dayEntry?.isHalfDay || false,
          };
        }),
        meetings: userMeetings.map((m) => ({
          title: m.title,
          startTime: m.startTime,
          endTime: m.endTime,
          meetingType: m.meetingType,
          status: m.status,
          location: m.location,
          startLocation: m.startLocation,
          endLocation: m.endLocation,
        })),
      };
    });

    return res.json({
      success: true,
      options,
      summary: {
        totalEmployees: users.length,
        totalWorkingDays,
        present: totalPresent,
        absent: totalAbsent || Math.max(totalWorkingDays - totalPresent, 0),
        late: totalLate,
        halfDay: totalHalfDay,
        overallAttendance: percent(totalPresent - totalHalfDay * 0.5, totalWorkingDays),
        totalMeetings: meetings.length,
      },
      daily,
      departmentRows,
      employeeRows,
    });
  } catch (error) {
    console.error("getAdminAttendanceReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load attendance report" });
  }
};

export const getAdminSimpleReport = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query.fromDate, req.query.toDate);
    const options = await getOptions();
    const activityQuery = dateQuery("loginTime", start, end);
    const meetingQuery = dateQuery("startTime", start, end);

    let filterUserIds = options.users.map((u) => u._id);
    if (req.query.department && req.query.department !== "all") {
      filterUserIds = filterUserIds.filter((id) => options.users.some((u) => asId(u._id) === asId(id) && u.department === req.query.department));
    }
    if (req.query.role && req.query.role !== "all") {
      filterUserIds = filterUserIds.filter((id) => options.users.some((u) => asId(u._id) === asId(id) && u.role === req.query.role));
    }
    if (req.query.salesManager && req.query.salesManager !== "all") {
      const mgrUser = options.users.find((u) => asId(u._id) === req.query.salesManager);
      if (mgrUser) {
        const mgrIds = options.users.filter((u) => u.managerName === mgrUser.name || asId(u._id) === req.query.salesManager).map((u) => u._id);
        filterUserIds = filterUserIds.filter((id) => mgrIds.some((m) => asId(m) === asId(id)));
      }
    }
    if (req.query.employee && req.query.employee !== "all") {
      filterUserIds = filterUserIds.filter((id) => asId(id) === req.query.employee);
    }

    // If sales manager, only show allocated users
    if (req.user?.role === "subadmin" && req.user?.subRole === "sales_manager") {
      const allocatedUserIds = await getAllocatedUsersForManager(req.user.id || req.user._id);
      filterUserIds = filterUserIds.filter((id) => allocatedUserIds.includes(asId(id)));
    }

    activityQuery.user = { $in: filterUserIds };
    meetingQuery.createdBy = { $in: filterUserIds };

    const [activities, meetings, meetingReports] = await Promise.all([
      Activity.find(activityQuery).populate("user", "name department role subRole").sort({ _id: -1 }).lean(),
      Meeting.find(meetingQuery).populate("createdBy", "name department").sort({ _id: -1 }).lean(),
      MeetingReport.find(dateQuery("meetingDateTime", start, end)).populate("createdBy", "name department").populate("meeting").sort({ _id: -1 }).lean(),
    ]);

    const enrichedReports = meetingReports.map((r) => {
      if (r.meeting && typeof r.meeting === "object" && r.meeting._id) return r;
      return r;
    });

    return res.json({ success: true, options, activities, meetings, meetingReports: enrichedReports });
  } catch (error) {
    console.error("getAdminSimpleReport error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load report" });
  }
};

// Get allocated users for a sales manager
export const getSalesManagerAllocatedUsers = async (req, res) => {
  try {
    const managerId = req.user.id || req.user._id;

    const allocations = await UserAllocation.find({
      salesManager: managerId,
      isActive: true,
    })
      .populate("salesUser", "name email employeeId designation department")
      .sort({ _id: -1 });

    const users = allocations.map((a) => a.salesUser);

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getSalesManagerAllocatedUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch allocated users",
    });
  }
};
