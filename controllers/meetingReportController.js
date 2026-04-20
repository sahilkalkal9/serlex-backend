import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";

export const createMeetingReport = async (req, res) => {
  try {
    const {
      meetingId,
      companyName,
      contactPerson,
      phoneNumber,
      meetingDateTime,
      meetingPurpose,
      leadStatus,
      expectedDealValue,
      notes,
    } = req.body;

    const meeting = await Meeting.findOne({
      _id: meetingId,
      createdBy: req.user.id,
      status: "completed",
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Completed meeting not found",
      });
    }

    const existingReport = await MeetingReport.findOne({
      meeting: meetingId,
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: "Report already added for this meeting",
      });
    }

    const report = await MeetingReport.create({
      meeting: meetingId,
      createdBy: req.user.id,
      companyName,
      contactPerson,
      phoneNumber,
      meetingDateTime,
      meetingPurpose,
      leadStatus,
      expectedDealValue: Number(expectedDealValue || 0),
      notes,
    });

    await Meeting.findByIdAndUpdate(meetingId, {
      hasReport: true,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting report added successfully",
      report,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting report",
    });
  }
};

export const getMeetingReports = async (req, res) => {
  try {
    const reports = await MeetingReport.find({ createdBy: req.user.id })
      .populate("meeting", "title personName companyName startTime status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reports,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meeting reports",
    });
  }
};

export const getEligibleMeetingsForReport = async (req, res) => {
  try {
    const completedMeetings = await Meeting.find({
      createdBy: req.user.id,
      status: "completed",
      hasReport: false,
    }).sort({ startTime: -1 });

    return res.status(200).json({
      success: true,
      meetings: completedMeetings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch eligible meetings",
    });
  }
};