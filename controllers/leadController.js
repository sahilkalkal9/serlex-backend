import Lead from "../models/Lead.js";
import MeetingReport from "../models/MeetingReport.js";
import PurchaseOrder from "../models/PurchaseOrder.js";

const isSalesManager = (user) => {
  return user?.role === "subadmin" && user?.subRole === "sales_manager";
};

const isLeadViewer = (user) => {
  return ["admin", "superadmin"].includes(user?.role) || isSalesManager(user);
};

const getDerivedLeadStatus = (latestReport, leadStatus) => {
  if (latestReport?.leadStatus === "converted") return "converted";
  if (latestReport?.leadStatus === "lead_closed") return "closed";
  return leadStatus || "active";
};

const populateLeadQuery = (query) => {
  return query
    .populate({
      path: "meetingId",
      select:
        "title personName designation companyName description location startTime endTime attendees createdBy status approvalStatus meetingType leadId followUpRemark startLocation endLocation hasReport createdAt updatedAt",
      populate: {
        path: "createdBy",
        select:
          "name email employeeId mobileNumber department designation role subRole",
      },
    })
    .populate({
      path: "followUps",
      select:
        "title personName designation companyName description location startTime endTime attendees createdBy status approvalStatus meetingType leadId followUpRemark startLocation endLocation hasReport createdAt updatedAt",
      populate: {
        path: "createdBy",
        select:
          "name email employeeId mobileNumber department designation role subRole",
      },
    });
};

export const getSalesManagerLeads = async (req, res) => {
  try {
    if (!isLeadViewer(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const leads = await populateLeadQuery(
      Lead.find({})
    )
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const leadIds = leads.map((lead) => lead.leadId).filter(Boolean);

    const reports = await MeetingReport.find({ leadId: { $in: leadIds } })
      .populate(
        "meeting",
        "title personName companyName location startTime endTime status meetingType leadId followUpRemark createdBy"
      )
      .populate(
        "createdBy",
        "name email employeeId mobileNumber department designation role subRole"
      )
      .populate(
        "purchaseOrder",
        "poNo companyName category poValue poDate expectedDeliveryDate deliveryDate status isApproved approvedBy approvedDate approvalRemarks activityStatus processingStatus processedBy processedDate processingRemarks trackingStatus vendorName paymentReceivedDate trackingRemarks remarks statusLogs createdBy createdAt updatedAt"
      )
      .sort({ meetingDateTime: -1, createdAt: -1 })
      .lean();

    const poNumbers = [
      ...new Set(
        reports
          .map((report) => report.purchaseOrderNumber || report.purchaseOrder?.poNo)
          .filter(Boolean)
      ),
    ];

    const purchaseOrders = await PurchaseOrder.find({ poNo: { $in: poNumbers } })
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .lean();

    const purchaseOrderByNo = new Map(
      purchaseOrders.map((order) => [order.poNo, order])
    );

    const reportsByLeadId = reports.reduce((acc, report) => {
      if (!report.leadId) return acc;

      if (!acc[report.leadId]) acc[report.leadId] = [];

      const poNo = report.purchaseOrderNumber || report.purchaseOrder?.poNo || "";
      const purchaseOrder =
        (poNo ? purchaseOrderByNo.get(poNo) : null) || report.purchaseOrder;

      acc[report.leadId].push({
        ...report,
        purchaseOrder: purchaseOrder || null,
      });

      return acc;
    }, {});

    const rows = leads.map((lead) => {
      const leadReports = reportsByLeadId[lead.leadId] || [];
      const sortedReports = [...leadReports].sort((a, b) => {
        const dateA = new Date(a.meetingDateTime || a.createdAt || 0).getTime();
        const dateB = new Date(b.meetingDateTime || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      const latestReport = sortedReports[0] || null;

      const purchaseOrderMap = new Map();

      sortedReports.forEach((report) => {
        const order = report.purchaseOrder;
        const key = order?.poNo || report.purchaseOrderNumber || "";

        if (key && !purchaseOrderMap.has(key)) {
          purchaseOrderMap.set(key, order || { poNo: key });
        }
      });

      const purchaseOrderList = Array.from(purchaseOrderMap.values());

      return {
        ...lead,
        status: getDerivedLeadStatus(latestReport, lead.status),
        latestLeadStatus: latestReport?.leadStatus || "",
        latestActivityAt:
          latestReport?.meetingDateTime ||
          latestReport?.createdAt ||
          lead.meetingId?.startTime ||
          lead.updatedAt,
        latestReport,
        reports: sortedReports,
        purchaseOrders: purchaseOrderList,
        poReceivedCount: sortedReports.filter(
          (report) => report.poReceived || report.purchaseOrder || report.purchaseOrderNumber
        ).length,
        totalPOValue: purchaseOrderList.reduce(
          (sum, order) => sum + Number(order?.poValue || 0),
          0
        ),
        sourceMeeting: lead.meetingId,
        followUps: Array.isArray(lead.followUps) ? lead.followUps : [],
        createdBy: lead.meetingId?.createdBy || null,
        createdByName: lead.meetingId?.createdBy?.name || "",
        createdByEmail: lead.meetingId?.createdBy?.email || "",
        reportCount: sortedReports.length,
        followUpCount: Array.isArray(lead.followUps) ? lead.followUps.length : 0,
      };
    });

    return res.status(200).json({
      success: true,
      count: rows.length,
      leads: rows,
    });
  } catch (error) {
    console.error("getSalesManagerLeads error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leads",
    });
  }
};
