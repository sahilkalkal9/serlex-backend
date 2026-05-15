import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import Lead from "../models/Lead.js";

const isAdminUser = (user) => {
  return ["admin", "superadmin"].includes(user?.role);
};

const isSalesManager = (user) => {
  return user?.role === "subadmin" && user?.subRole === "sales_manager";
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const getReportPopulateQuery = (query) => {
  return query
    .populate(
      "meeting",
      "title personName companyName startTime endTime status meetingType attendees"
    )
    .populate(
      "createdBy",
      "name email employeeId mobileNumber department designation role subRole"
    )
    .populate(
      "purchaseOrder",
      "poNo companyName category poValue poDate expectedDeliveryDate status trackingStatus"
    );
};

const buildReportPayload = (reqBody) => { return reqBody; };

const clientLeadStatuses = ["hot", "warm", "cold", "converted", "lead_closed"];

const toLeadModelStatus = (leadStatus = "") => {
  if (leadStatus === "converted") return "converted";
  if (leadStatus === "lead_closed") return "closed";
  return "active";
};

const syncLeadFromReport = async ({
  leadId,
  companyName,
  contactPerson,
  leadStatus,
}) => {
  if (!leadId?.trim()) return;

  await Lead.findOneAndUpdate(
    { leadId: leadId.trim() },
    {
      $set: {
        companyName: companyName || "",
        contactPerson: contactPerson || "",
        status: toLeadModelStatus(leadStatus),
      },
    }
  );
};

export const createMeetingReport = async (req, res) => {
  try {
    const {
      meetingId,
      meetingPoints,
      leadId,
      purchaseOrderNumber,
      companyName,
      contactPerson,
      phoneNumber,
      meetingDateTime,
      poDate,
      poExpectedDeliveryDate,
      meetingPurpose,
      category,
      paymentTerms,
      leadStatus,
      expectedDealValue,
      notes,
      poReceived,
      leadClosedRemark,
    } = req.body;

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: "Meeting is required",
      });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const reportType = meeting.meetingType === "team" ? "team" : "client";

    if (reportType === "team") {
      if (!meetingPoints?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Meeting points are required",
        });
      }
    } else {
      if (!companyName?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Company name is required",
        });
      }
      if (!contactPerson?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Contact person is required",
        });
      }
      if (!phoneNumber?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
        });
      }
      if (leadStatus && !clientLeadStatuses.includes(leadStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead status",
        });
      }
    }

    const reportPayload = {
      meeting: meetingId,
      createdBy: getUserId(req),
      reportType,
    };

    let purchaseOrder = null;

    if (reportType === "team") {
      reportPayload.meetingPoints = meetingPoints.trim();
      reportPayload.notes = notes || "";
    } else {
      reportPayload.leadId = leadId || "";
      reportPayload.companyName = companyName.trim();
      reportPayload.contactPerson = contactPerson.trim();
      reportPayload.phoneNumber = phoneNumber.trim();
      reportPayload.meetingDateTime = meetingDateTime;
      reportPayload.meetingPurpose = meetingPurpose || "";
      reportPayload.category = category || "";
      reportPayload.paymentTerms = paymentTerms || "";
      reportPayload.leadStatus = leadStatus || "warm";
      reportPayload.expectedDealValue = Number(expectedDealValue || 0);
      reportPayload.notes = notes || "";
      reportPayload.poReceived = poReceived || false;
      reportPayload.leadClosedRemark = leadClosedRemark || "";
      reportPayload.purchaseOrderNumber = purchaseOrderNumber || "";
      reportPayload.poDate = poDate || null;
      reportPayload.poExpectedDeliveryDate = poExpectedDeliveryDate || null;

      if (poReceived) {
        if (!purchaseOrderNumber?.trim()) {
          return res.status(400).json({
            success: false,
            message: "Purchase order number is required",
          });
        }
        purchaseOrder = await PurchaseOrder.create({
          poNo: purchaseOrderNumber.trim(),
          companyName: companyName.trim(),
          category: category || "Trading",
          poValue: Number(expectedDealValue || 0),
          poDate,
          expectedDeliveryDate: poExpectedDeliveryDate || null,
          createdBy: getUserId(req),
        });
        reportPayload.purchaseOrder = purchaseOrder._id;
      }
    }

    const report = await MeetingReport.create(reportPayload);

    await Meeting.findByIdAndUpdate(meetingId, { hasReport: true });

    if (reportType === "client") {
      await syncLeadFromReport({
        leadId: reportPayload.leadId,
        companyName: reportPayload.companyName,
        contactPerson: reportPayload.contactPerson,
        leadStatus: reportPayload.leadStatus,
      });
    }

    const populatedReport = await getReportPopulateQuery(
      MeetingReport.findById(report._id)
    );

    return res.status(201).json({
      success: true,
      message:
        reportType === "team"
          ? "Team meeting report added successfully"
          : purchaseOrder
            ? "Meeting report and purchase order added successfully"
            : "Meeting report added successfully",
      report: populatedReport,
      purchaseOrder,
    });
  } catch (error) {
    console.error("createMeetingReport error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting report",
    });
  }
};

export const checkMissingReports = async (req, res) => {
  try {
    const count = await Meeting.countDocuments({
      createdBy: getUserId(req),
      status: "completed",
      hasReport: false,
    });
    return res.status(200).json({
      success: true,
      missingCount: count,
    });
  } catch (error) {
    console.error("checkMissingReports error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check missing reports",
    });
  }
};

export const getMeetingReports = async (req, res) => {
  try {
    let query = {};

    if (isAdminUser(req.user)) {
      query = {};
    } else if (isSalesManager(req.user)) {
      const salesUsers = await User.find({ role: "sales_user" }).select("_id");
      const salesUserIds = salesUsers.map((user) => user._id);

      query = {
        createdBy: { $in: salesUserIds },
      };
    } else {
      query = {
        createdBy: getUserId(req),
      };
    }

    const reports = await getReportPopulateQuery(
      MeetingReport.find(query)
    ).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("getMeetingReports error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meeting reports",
    });
  }
};

export const getMeetingReportByMeetingId = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const report = await getReportPopulateQuery(
      MeetingReport.findOne({ meeting: meetingId })
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found for this meeting",
      });
    }

    return res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error("getMeetingReportByMeetingId error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meeting report",
    });
  }
};

export const getReportsByLeadId = async (req, res) => {
  try {
    const { leadId } = req.params;

    if (!leadId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const reports = await getReportPopulateQuery(
      MeetingReport.find({ leadId: leadId.trim() })
    ).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("getReportsByLeadId error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch reports",
    });
  }
};

export const getEligibleMeetingsForReport = async (req, res) => {
  try {
    const completedMeetings = await Meeting.find({
      createdBy: getUserId(req),
      status: "completed",
      hasReport: false,
    })
      .select(
        "title personName companyName location startTime endTime status meetingType attendees leadId"
      )
      .sort({ startTime: -1 });

    return res.status(200).json({
      success: true,
      meetings: completedMeetings,
    });
  } catch (error) {
    console.error("getEligibleMeetingsForReport error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch eligible meetings",
    });
  }
};

export const getLeadIds = async (req, res) => {
  try {
    const reports = await MeetingReport.aggregate([
      {
        $match: {
          leadId: { $ne: "", $exists: true },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: "$leadId",
          leadId: { $first: "$leadId" },
          companyName: { $first: "$companyName" },
          contactPerson: { $first: "$contactPerson" },
          latestStatus: { $first: "$leadStatus" },
          latestReportId: { $first: "$_id" },
        },
      },
      {
        $match: {
          latestStatus: { $nin: ["converted", "lead_closed"] },
        },
      },
      {
        $project: {
          _id: 0,
          leadId: 1,
          companyName: 1,
          contactPerson: 1,
        },
      },
      {
        $sort: { leadId: 1 },
      },
    ]);

    return res.status(200).json({
      success: true,
      leadIds: reports,
    });
  } catch (error) {
    console.error("getLeadIds error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch lead IDs",
    });
  }
};

export const updateMeetingReport = async (req, res) => {
  try {
    const { id } = req.params;

    let query = { _id: id };

    if (!isAdminUser(req.user) && !isSalesManager(req.user)) {
      query.createdBy = getUserId(req);
    }

    const report = await MeetingReport.findOne(query).populate(
      "meeting",
      "meetingType"
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Meeting report not found",
      });
    }

    const reportType =
      report.reportType === "team" || report.meeting?.meetingType === "team"
        ? "team"
        : "client";

    if (reportType === "team") {
      const { meetingPoints, notes } = req.body;

      if (!meetingPoints?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Meeting points are required",
        });
      }

      report.meetingPoints = meetingPoints.trim();
      report.notes = notes || report.notes || "";
    } else {
      const {
        companyName,
        contactPerson,
        phoneNumber,
        purchaseOrderNumber,
        meetingDateTime,
        meetingPurpose,
        category,
        paymentTerms,
        leadStatus,
        expectedDealValue,
        notes,
      } = req.body;

      if (!companyName?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Company name is required",
        });
      }

      if (!contactPerson?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Contact person is required",
        });
      }

      if (!phoneNumber?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
        });
      }

      if (leadStatus && !clientLeadStatuses.includes(leadStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead status",
        });
      }

      report.companyName = companyName.trim();
      report.contactPerson = contactPerson.trim();
      report.phoneNumber = phoneNumber.trim();
      report.purchaseOrderNumber = purchaseOrderNumber || "";
      report.meetingDateTime = meetingDateTime || report.meetingDateTime;
      report.meetingPurpose = meetingPurpose || "";
      report.category = category || "";
      report.paymentTerms = paymentTerms || "";
      report.leadStatus = leadStatus || report.leadStatus;
      report.expectedDealValue = Number(expectedDealValue || 0);
      report.notes = notes || "";

      if (report.purchaseOrder) {
        await PurchaseOrder.findByIdAndUpdate(report.purchaseOrder, {
          poNo: purchaseOrderNumber || report.purchaseOrderNumber,
          companyName: companyName.trim(),
          category: category || "Trading",
          poValue: Number(expectedDealValue || 0),
        });
      }
    }

    await report.save();

    await syncLeadFromReport({
      leadId: report.leadId,
      companyName: report.companyName,
      contactPerson: report.contactPerson,
      leadStatus: report.leadStatus,
    });

    const updatedReport = await getReportPopulateQuery(
      MeetingReport.findById(report._id)
    );

    return res.status(200).json({
      success: true,
      message: "Meeting report updated successfully",
      report: updatedReport,
    });
  } catch (error) {
    console.error("updateMeetingReport error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting report",
    });
  }
};
