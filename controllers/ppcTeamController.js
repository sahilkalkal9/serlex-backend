import User from "../models/User.js";
import Meeting from "../models/Meeting.js";

export const getPpcMembers = async (req, res) => {
  try {
    const users = await User.find({ role: "ppc_user" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch PPC users" });
  }
};

export const createPpcMember = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      role: "ppc_user",
      subRole: "",
    };

    const user = await User.create(payload);

    res.status(201).json({
      success: true,
      message: "PPC team member created successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to create PPC member",
    });
  }
};

export const updatePpcMember = async (req, res) => {
  try {
    const payload = { ...req.body, role: "ppc_user" };

    if (!payload.password) delete payload.password;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "ppc_user" },
      payload,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "PPC member not found" });
    }

    res.status(200).json({
      success: true,
      message: "PPC member updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to update PPC member",
    });
  }
};

export const deletePpcMember = async (req, res) => {
  try {
    const user = await User.findOneAndDelete({
      _id: req.params.id,
      role: "ppc_user",
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "PPC member not found" });
    }

    res.status(200).json({
      success: true,
      message: "PPC member deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete PPC member" });
  }
};

export const getPpcTeamMeetings = async (req, res) => {
  try {
    const { approvalStatus, status, teamMemberId, fromDate, toDate } = req.query;

    const ppcUsers = await User.find({ role: "ppc_user" }).select("_id");
    const ppcUserIds = ppcUsers.map((user) => user._id);

    const query = {
      createdBy: { $in: ppcUserIds },
    };

    if (teamMemberId) query.createdBy = teamMemberId;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (status) query.status = status;

    if (fromDate || toDate) {
      query.startTime = {};

      if (fromDate) {
        query.startTime.$gte = new Date(`${fromDate}T00:00:00.000Z`);
      }

      if (toDate) {
        query.startTime.$lte = new Date(`${toDate}T23:59:59.999Z`);
      }
    }

    const meetings = await Meeting.find(query)
      .populate("createdBy", "name email employeeId mobileNumber designation role")
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      meetings,
      total: meetings.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch PPC team meetings",
    });
  }
};

export const updatePpcMeetingApproval = async (req, res) => {
  try {
    const { approvalStatus } = req.body;

    if (!["pending", "approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval status",
      });
    }

    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { approvalStatus },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email designation role");

    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    res.status(200).json({
      success: true,
      message: "Meeting approval status updated",
      meeting,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update approval status",
    });
  }
};

export const updatePpcMeetingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["upcoming", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting status",
      });
    }

    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email designation role");

    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    res.status(200).json({
      success: true,
      message: "Meeting status updated",
      meeting,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update meeting status",
    });
  }
};