import Meeting from "../models/Meeting.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";

export const createMeetingReport = async (req, res) => {
  try {
    const {
      meetingId,
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

    let purchaseOrder = null;

    /*
      PO creation logic:
      - If Purchase Order Number is filled, then create PurchaseOrder
      - poDate is required in PurchaseOrder model, so fallback is current date
    */
    if (purchaseOrderNumber) {
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
        companyName,
        category: category || "Trading",
        poValue: Number(expectedDealValue || 0),
        poDate: poDate || new Date(),
        expectedDeliveryDate: poExpectedDeliveryDate || null,
        deliveryDate: null,
        status: "Pending",
      });
    }

    const report = await MeetingReport.create({
      meeting: meetingId,
      createdBy: req.user.id,
      leadId,
      purchaseOrderNumber: purchaseOrderNumber || "",
      companyName,
      contactPerson,
      phoneNumber,
      meetingDateTime,
      poDate: poDate || null,
      poExpectedDeliveryDate: poExpectedDeliveryDate || null,
      meetingPurpose,
      category,
      paymentTerms,
      leadStatus,
      expectedDealValue: Number(expectedDealValue || 0),
      notes,
      purchaseOrder: purchaseOrder?._id || null,
    });

    await Meeting.findByIdAndUpdate(meetingId, {
      hasReport: true,
    });

    return res.status(201).json({
      success: true,
      message: purchaseOrder
        ? "Meeting report and purchase order added successfully"
        : "Meeting report added successfully",
      report,
      purchaseOrder,
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
      .populate(
        "purchaseOrder",
        "poNo companyName category poValue poDate expectedDeliveryDate status"
      )
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