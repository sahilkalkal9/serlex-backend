import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";

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

export const createMeetingReport = async (req, res) => {
  try {
    const {
      meetingId,

      // Team report field
      meetingPoints,

      // Client report fields
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
    } = req.body;

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: "Meeting is required",
      });
    }

    const meeting = await Meeting.findOne({
      _id: meetingId,
      createdBy: getUserId(req),
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

    const reportType = meeting.meetingType === "team" ? "team" : "client";

    if (reportType === "team") {
      if (!meetingPoints?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Meeting points are required for team meeting report",
        });
      }
    }

    if (reportType === "client") {
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

      if (!meetingDateTime) {
        return res.status(400).json({
          success: false,
          message: "Meeting date and time is required",
        });
      }

      if (!leadStatus) {
        return res.status(400).json({
          success: false,
          message: "Lead status is required",
        });
      }

      if (!["hot", "warm", "cold"].includes(leadStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead status",
        });
      }
    }

    let purchaseOrder = null;

    if (reportType === "client" && purchaseOrderNumber?.trim()) {
      const finalPoNo = purchaseOrderNumber.trim();

      const existingPurchaseOrder = await PurchaseOrder.findOne({
        poNo: finalPoNo,
      });

      if (existingPurchaseOrder) {
        return res.status(400).json({
          success: false,
          message: "Purchase order already exists with this PO number",
        });
      }

      purchaseOrder = await PurchaseOrder.create({
        poNo: finalPoNo,
        companyName: companyName?.trim(),
        category: category || "Trading",
        poValue: Number(expectedDealValue || 0),
        poDate: poDate || new Date(),
        expectedDeliveryDate: poExpectedDeliveryDate || null,
        deliveryDate: null,
        status: "Pending",

        // Important for sales target achievement calculation
        createdBy: getUserId(req),

        // Defaults for tracking flow
        trackingStatus: "Not Approved",
        activityStatus: "Not Ordered",
        processingStatus: "Pending",
      });
    }

    const reportPayload =
      reportType === "team"
        ? {
            meeting: meetingId,
            createdBy: getUserId(req),
            reportType: "team",
            meetingPoints: meetingPoints.trim(),

            companyName: meeting.companyName || "Team Meeting",
            contactPerson: meeting.personName || "Team",
            phoneNumber: "",
            meetingDateTime: meeting.startTime || new Date(),
            meetingPurpose: meeting.title || "Team Meeting",
            leadStatus: undefined,
            expectedDealValue: 0,
            notes: notes || "",
            leadId: "",
            poDate: null,
            poExpectedDeliveryDate: null,
            category: "",
            paymentTerms: "",
            purchaseOrderNumber: "",
            purchaseOrder: null,
          }
        : {
            meeting: meetingId,
            createdBy: getUserId(req),
            reportType: "client",
            meetingPoints: "",

            leadId: leadId || "",
            purchaseOrderNumber: purchaseOrderNumber || "",
            companyName: companyName?.trim(),
            contactPerson: contactPerson?.trim(),
            phoneNumber: phoneNumber?.trim(),
            meetingDateTime,
            poDate: poDate || null,
            poExpectedDeliveryDate: poExpectedDeliveryDate || null,
            meetingPurpose: meetingPurpose || "",
            category: category || "",
            paymentTerms: paymentTerms || "",
            leadStatus,
            expectedDealValue: Number(expectedDealValue || 0),
            notes: notes || "",
            purchaseOrder: purchaseOrder?._id || null,
          };

    const report = await MeetingReport.create(reportPayload);

    await Meeting.findByIdAndUpdate(meetingId, {
      hasReport: true,
    });

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

export const getEligibleMeetingsForReport = async (req, res) => {
  try {
    const completedMeetings = await Meeting.find({
      createdBy: getUserId(req),
      status: "completed",
      hasReport: false,
    })
      .select(
        "title personName companyName location startTime endTime status meetingType attendees"
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

      if (leadStatus && !["hot", "warm", "cold"].includes(leadStatus)) {
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