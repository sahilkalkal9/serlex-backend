import { google } from "googleapis";
import Meeting from "../models/Meeting.js";
import User from "../models/User.js";
import { getAuthorizedOAuthClient } from "../utils/googleClient.js";

export const getMeetings = async (req, res) => {
  try {
    const { status } = req.query;

    const query = { createdBy: req.user.id };

    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      query.status = status;
    }

    const meetings = await Meeting.find(query).sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      meetings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meetings",
    });
  }
};

export const getSalesUsersMeetings = async (req, res) => {
  try {
    const { status, approvalStatus, search = "" } = req.query;

    const salesUsers = await User.find({ role: "sales_user" }).select("_id");
    const salesUserIds = salesUsers.map((user) => user._id);

    const query = {
      createdBy: { $in: salesUserIds },
    };

    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      query.status = status;
    }

    if (
      approvalStatus &&
      ["pending", "approved", "rejected"].includes(approvalStatus)
    ) {
      query.approvalStatus = approvalStatus;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { personName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const meetings = await Meeting.find(query)
      .populate(
        "createdBy",
        "name email employeeId mobileNumber department designation role"
      )
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      count: meetings.length,
      meetings,
    });
  } catch (error) {
    console.error("getSalesUsersMeetings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch sales users meetings",
    });
  }
};

export const createMeeting = async (req, res) => {
  try {
    const {
      title,
      personName,
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName,
      description,
      location,
      startTime,
      endTime,
      attendees = [],
      avatarUrl = "",
      status = "upcoming",
    } = req.body;

    const oauth2Client = await getAuthorizedOAuthClient(req.user.id);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const eventPayload = {
      summary: title,
      description,
      location,
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: attendees.map((email) => ({ email })),
    };

    const googleResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventPayload,
    });

    const meeting = await Meeting.create({
      title,
      personName,
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName,
      description,
      location,
      startTime,
      endTime,
      attendees: attendees.map((email) => ({ email })),
      avatarUrl,
      createdBy: req.user.id,
      googleEventId: googleResponse.data.id || "",
      googleCalendarId: "primary",
      source: "google",
      status,
      approvalStatus: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Meeting created successfully",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting",
    });
  }
};

export const updateMeetingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["upcoming", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const meeting = await Meeting.findById(id).populate(
      "createdBy",
      "role subRole"
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const isOwner = meeting.createdBy?._id?.toString() === req.user.id;
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const isSalesManager =
      req.user.role === "subadmin" && req.user.subRole === "sales_manager";

    if (!isOwner && !isAdmin && !isSalesManager) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    meeting.status = status;
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Meeting status updated successfully",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting status",
    });
  }
};

export const updateMeetingApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus } = req.body;

    if (!["pending", "approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval status",
      });
    }

    const meeting = await Meeting.findById(id).populate(
      "createdBy",
      "role subRole"
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const isSalesManager =
      req.user.role === "subadmin" && req.user.subRole === "sales_manager";

    if (!isAdmin && !isSalesManager) {
      return res.status(403).json({
        success: false,
        message: "Only manager/admin can approve meeting",
      });
    }

    if (meeting.approvalStatus !== "pending" && approvalStatus === "approved") {
      return res.status(400).json({
        success: false,
        message: "Only pending meetings can be approved",
      });
    }

    meeting.approvalStatus = approvalStatus;
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: `Meeting ${approvalStatus} successfully`,
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting approval status",
    });
  }
};

export const createMeetingForSalesUser = async (req, res) => {
  try {
    const {
      salesUserId,
      title,
      personName,
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName,
      description,
      location,
      startTime,
      endTime,
      attendees = [],
      avatarUrl = "",
      status = "upcoming",
    } = req.body;

    if (!salesUserId) {
      return res.status(400).json({
        success: false,
        message: "Sales user is required",
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

    const oauth2Client = await getAuthorizedOAuthClient(salesUserId);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const eventPayload = {
      summary: title,
      description,
      location,
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: attendees.map((email) => ({ email })),
    };

    const googleResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventPayload,
    });

    const meeting = await Meeting.create({
      title,
      personName,
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName,
      description,
      location,
      startTime,
      endTime,
      attendees: attendees.map((email) => ({ email })),
      avatarUrl,
      createdBy: salesUserId,
      googleEventId: googleResponse.data.id || "",
      googleCalendarId: "primary",
      source: "google",
      status,
      approvalStatus: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Meeting created for sales user successfully",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting for sales user",
    });
  }
};