import Activity from "../models/Activity.js";
import Meeting from "../models/Meeting.js";
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

    const [
      meetingsScheduled,
      meetingsConfirmed,
      meetingsPending,
      currentMonthPOs,
      activeEmployees,
      recentMeetings,
      recentPOs,
      recentLogins,
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
    const users = await User.find({ status: { $ne: "inactive" } })
      .select("name email employeeId mobileNumber department designation role subRole status")
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

    return res.status(200).json({
      success: true,
      count: meetings.length,
      meetings,
    });
  } catch (error) {
    console.error("getAdminMeetings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load meetings",
    });
  }
};
