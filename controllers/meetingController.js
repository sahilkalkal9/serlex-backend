import { google } from "googleapis";
import Meeting from "../models/Meeting.js";
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

    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, createdBy: req.user.id },
      { status },
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

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