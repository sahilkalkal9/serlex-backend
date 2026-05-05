import Meeting from "../models/Meeting.js";
import User from "../models/User.js";

export const getPurchaseUsersMeetings = async (req, res) => {
  try {
    const { status, approvalStatus, teamMemberId, search = "" } = req.query;

    const purchaseUsers = await User.find({ role: "purchase_user" }).select("_id");

    const purchaseUserIds = purchaseUsers.map((user) => user._id);

    const query = {
      createdBy: { $in: purchaseUserIds },
    };

    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      query.status = status;
    }

    if (fromDate || toDate) {
  query.startTime = {};

  if (fromDate) {
    query.startTime.$gte = new Date(`${fromDate}T00:00:00.000Z`);
  }

  if (toDate) {
    query.startTime.$lte = new Date(`${toDate}T23:59:59.999Z`);
  }
}

    if (
      approvalStatus &&
      ["pending", "approved", "rejected"].includes(approvalStatus)
    ) {
      query.approvalStatus = approvalStatus;
    }

    if (teamMemberId) {
      query.createdBy = teamMemberId;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { personName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const meetings = await Meeting.find(query)
      .populate(
        "createdBy",
        "name email employeeId mobileNumber department designation role status"
      )
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      count: meetings.length,
      meetings,
    });
  } catch (error) {
    console.error("getPurchaseUsersMeetings error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch purchase users meetings",
    });
  }
};

export const updatePurchaseMeetingApproval = async (req, res) => {
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
      "name role designation"
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.createdBy?.role !== "purchase_user") {
      return res.status(403).json({
        success: false,
        message: "This meeting does not belong to purchase team",
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
    console.error("updatePurchaseMeetingApproval error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting approval",
    });
  }
};