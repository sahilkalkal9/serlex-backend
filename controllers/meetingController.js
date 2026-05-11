import { google } from "googleapis";
import Meeting from "../models/Meeting.js";
import User from "../models/User.js";
import { getAuthorizedOAuthClient } from "../utils/googleClient.js";

const normalizeAttendees = (attendees = []) => {
  if (!Array.isArray(attendees)) return [];

  return attendees
    .map((item) => {
      if (typeof item === "string") return item.trim().toLowerCase();
      return item?.email?.trim()?.toLowerCase();
    })
    .filter(Boolean);
};

const buildAttendeeResponses = (emails = []) => {
  return emails.map((email) => ({
    email,
    status: "pending",
    rejectionReason: "",
    respondedAt: null,
    respondedBy: null,
  }));
};

const populateMeetingQuery = (query) => {
  return query
    .populate(
      "createdBy",
      "name email employeeId mobileNumber department designation role subRole"
    )
    .populate("cancelledBy", "name email role subRole")
    .populate("attendeeResponses.respondedBy", "name email role subRole");
};

export const getMeetings = async (req, res) => {
  try {
    const { status } = req.query;

    const query = { createdBy: req.user.id };

    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      query.status = status;
    }

    const meetings = await populateMeetingQuery(
      Meeting.find(query)
    ).sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      meetings,
    });
  } catch (error) {
    console.error("getMeetings error:", error);

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

    const meetings = await populateMeetingQuery(
      Meeting.find(query)
    ).sort({ startTime: 1 });

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
      meetingType = "client",
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Meeting title is required",
      });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time and end time are required",
      });
    }

    if (!["client", "team"].includes(meetingType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting type",
      });
    }

    if (meetingType === "client" && !personName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Person name is required for client meeting",
      });
    }

    const attendeeEmails = normalizeAttendees(attendees);

    const oauth2Client = await getAuthorizedOAuthClient(req.user.id);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const eventPayload = {
      summary: title,
      description,
      location: meetingType === "team" ? "" : location || "",
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: attendeeEmails.map((email) => ({ email })),
    };

    const googleResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventPayload,
      sendUpdates: "all",
    });

    const meeting = await Meeting.create({
      title,
      personName:
        meetingType === "team" ? "Team Meeting" : personName?.trim(),
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName: meetingType === "team" ? "" : companyName || "",
      description,
      location: meetingType === "team" ? "" : location || "",
      startTime,
      endTime,
      attendees: attendeeEmails.map((email) => ({ email })),
      attendeeResponses: buildAttendeeResponses(attendeeEmails),
      avatarUrl,
      createdBy: req.user.id,
      googleEventId: googleResponse.data.id || "",
      googleCalendarId: "primary",
      source: "google",
      status,
      approvalStatus: "pending",
      meetingType,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting created successfully",
      meeting,
    });
  } catch (error) {
    console.error("createMeeting error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting",
    });
  }
};

export const updateMeetingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancellationRemark = "" } = req.body;

    if (!["upcoming", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    if (status === "cancelled" && !cancellationRemark.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation remark is required",
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

    if (status === "cancelled" && meeting.googleEventId) {
      try {
        const oauthUserId = meeting.createdBy?._id?.toString() || req.user.id;
        const oauth2Client = await getAuthorizedOAuthClient(oauthUserId);
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        await calendar.events.delete({
          calendarId: meeting.googleCalendarId || "primary",
          eventId: meeting.googleEventId,
          sendUpdates: "all",
        });
      } catch (googleError) {
        console.error("Google calendar cancellation error:", googleError);

        return res.status(500).json({
          success: false,
          message:
            googleError?.response?.data?.error?.message ||
            "Meeting status not updated because Google Calendar cancellation failed",
        });
      }
    }

    meeting.status = status;

    if (status === "cancelled") {
      meeting.cancellationRemark = cancellationRemark.trim();
      meeting.cancelledBy = req.user.id;
    }

    await meeting.save();

    const updatedMeeting = await populateMeetingQuery(
      Meeting.findById(meeting._id)
    );

    return res.status(200).json({
      success: true,
      message:
        status === "cancelled"
          ? "Meeting cancelled successfully and attendees notified"
          : "Meeting status updated successfully",
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("updateMeetingStatus error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting status",
    });
  }
};

export const respondToMeetingInvite = async (req, res) => {
  try {
    const { id } = req.params;
    const { responseStatus, rejectionReason = "" } = req.body;

    if (!["approved", "rejected"].includes(responseStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid response status",
      });
    }

    if (responseStatus === "rejected" && !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot respond to a cancelled meeting",
      });
    }

    const userEmail = req.user.email?.toLowerCase();

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: "User email not found",
      });
    }

    const isInvited = meeting.attendees?.some((attendee) => {
      return attendee?.email?.toLowerCase() === userEmail;
    });

    if (!isInvited) {
      return res.status(403).json({
        success: false,
        message: "You are not invited to this meeting",
      });
    }

    const existingIndex = meeting.attendeeResponses.findIndex(
      (item) => item.email?.toLowerCase() === userEmail
    );

    const responsePayload = {
      email: userEmail,
      status: responseStatus,
      rejectionReason:
        responseStatus === "rejected" ? rejectionReason.trim() : "",
      respondedAt: new Date(),
      respondedBy: req.user.id,
    };

    if (existingIndex >= 0) {
      meeting.attendeeResponses[existingIndex] = responsePayload;
    } else {
      meeting.attendeeResponses.push(responsePayload);
    }

    await meeting.save();

    const updatedMeeting = await populateMeetingQuery(
      Meeting.findById(meeting._id)
    );

    return res.status(200).json({
      success: true,
      message:
        responseStatus === "approved"
          ? "Meeting invite approved"
          : "Meeting invite rejected",
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("respondToMeetingInvite error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to respond to meeting invite",
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

    const updatedMeeting = await populateMeetingQuery(
      Meeting.findById(meeting._id)
    );

    return res.status(200).json({
      success: true,
      message: `Meeting ${approvalStatus} successfully`,
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("updateMeetingApprovalStatus error:", error);

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
      meetingType = "client",
    } = req.body;

    if (!salesUserId) {
      return res.status(400).json({
        success: false,
        message: "Sales user is required",
      });
    }

    if (!["client", "team"].includes(meetingType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting type",
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

    if (meetingType === "client" && !personName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Person name is required for client meeting",
      });
    }

    const attendeeEmails = normalizeAttendees(attendees);

    const oauth2Client = await getAuthorizedOAuthClient(salesUserId);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const eventPayload = {
      summary: title,
      description,
      location: meetingType === "team" ? "" : location || "",
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: attendeeEmails.map((email) => ({ email })),
    };

    const googleResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventPayload,
      sendUpdates: "all",
    });

    const meeting = await Meeting.create({
      title,
      personName:
        meetingType === "team" ? "Team Meeting" : personName?.trim(),
      designation,
      experienceYears,
      rating,
      reviewsCount,
      companyName: meetingType === "team" ? "" : companyName || "",
      description,
      location: meetingType === "team" ? "" : location || "",
      startTime,
      endTime,
      attendees: attendeeEmails.map((email) => ({ email })),
      attendeeResponses: buildAttendeeResponses(attendeeEmails),
      avatarUrl,
      createdBy: salesUserId,
      googleEventId: googleResponse.data.id || "",
      googleCalendarId: "primary",
      source: "google",
      status,
      approvalStatus: "pending",
      meetingType,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting created for sales user successfully",
      meeting,
    });
  } catch (error) {
    console.error("createMeetingForSalesUser error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting for sales user",
    });
  }
};