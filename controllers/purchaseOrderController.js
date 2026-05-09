import PurchaseOrder from "../models/PurchaseOrder.js";

const formatMoney = (amount = 0) => {
  if (amount >= 10000000) return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(2)} L`;
  return `₹ ${Number(amount || 0).toLocaleString("en-IN")}`;
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const getDateRangeFilter = (fromDate, toDate, field = "poDate") => {
  const filter = {};

  if (fromDate || toDate) {
    filter[field] = {};

    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      filter[field].$gte = from;
    }

    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      filter[field].$lte = to;
    }
  }

  return filter;
};

const getDelayInfo = (order) => {
  if (!order.expectedDeliveryDate) {
    return {
      delayStatus: "Pending",
      delayDays: 0,
      delayType: "pending",
    };
  }

  const expectedDate = new Date(order.expectedDeliveryDate);
  const compareDate = order.deliveryDate
    ? new Date(order.deliveryDate)
    : new Date();

  expectedDate.setHours(0, 0, 0, 0);
  compareDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (compareDate.getTime() - expectedDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (diffDays > 0) {
    return {
      delayStatus: `Delayed (${diffDays} day${diffDays > 1 ? "s" : ""})`,
      delayDays: diffDays,
      delayType: "delayed",
    };
  }

  if (diffDays < 0) {
    const earlyDays = Math.abs(diffDays);

    return {
      delayStatus: `Early (${earlyDays} day${earlyDays > 1 ? "s" : ""})`,
      delayDays: diffDays,
      delayType: "early",
    };
  }

  return {
    delayStatus: "On Time",
    delayDays: 0,
    delayType: "onTime",
  };
};

const getApprovedFilter = () => ({
  isApproved: true,
});

export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      poNo,
      companyName,
      category,
      poValue,
      poDate,
      expectedDeliveryDate,
      deliveryDate,
      status,
      isApproved,
      approvedDate,
      approvalRemarks,
      activityStatus,
      processingStatus,
      processedDate,
      processingRemarks,
      remarks,
      trackingStatus,
      vendorName,
      trackingRemarks,
      paymentReceivedDate,
    } = req.body;

    if (!poNo || !companyName || !poValue || !poDate) {
      return res.status(400).json({
        success: false,
        message: "PO No, company name, PO value and PO date are required",
      });
    }

    const existingPO = await PurchaseOrder.findOne({ poNo: poNo.trim() });

    if (existingPO) {
      return res.status(409).json({
        success: false,
        message: "PO number already exists",
      });
    }

    const approvedValue = Boolean(isApproved || status === "Approved");

    const finalProcessingStatus = processingStatus || "Pending";
    const shouldSetProcessedBy = finalProcessingStatus === "Processed";

    const purchaseOrder = await PurchaseOrder.create({
      poNo: poNo.trim(),
      companyName: companyName.trim(),
      category: category?.trim() || "Trading",
      poValue: Number(poValue),
      poDate,
      expectedDeliveryDate: expectedDeliveryDate || null,
      deliveryDate: deliveryDate || null,

      status: approvedValue ? "Approved" : status || "Pending",

      isApproved: approvedValue,
      approvedBy: approvedValue ? getUserId(req) : null,
      approvedDate: approvedValue ? approvedDate || new Date() : null,
      approvalRemarks: approvalRemarks || "",

      activityStatus: activityStatus || "Not Ordered",

      processingStatus: finalProcessingStatus,
      processedBy: shouldSetProcessedBy ? getUserId(req) : null,
      processedDate: shouldSetProcessedBy ? processedDate || new Date() : null,
      processingRemarks: processingRemarks || "",

      remarks: remarks || "",

      trackingStatus:
        trackingStatus || (approvedValue ? "Approved" : "Not Approved"),

      vendorName: vendorName || "",
      trackingRemarks: trackingRemarks || "",
      paymentReceivedDate: paymentReceivedDate || null,

      createdBy: getUserId(req),
    });

    return res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      purchaseOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create purchase order",
      error: error.message,
    });
  }
};

export const updatePurchaseOrderApproval = async (req, res) => {
  try {
    const { isApproved, approvalRemarks } = req.body;

    if (typeof isApproved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isApproved must be true or false",
      });
    }

    const updateData = {
      isApproved,
      approvalRemarks: approvalRemarks || "",
      status: isApproved ? "Approved" : "Pending",
      trackingStatus: isApproved ? "Approved" : "Not Approved",
      approvedBy: isApproved ? getUserId(req) : null,
      approvedDate: isApproved ? new Date() : null,
    };

    if (!isApproved) {
      updateData.processingStatus = "Pending";
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
    }

    const order = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: isApproved
        ? "Purchase order approved successfully"
        : "Purchase order moved back to pending",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update approval status",
      error: error.message,
    });
  }
};

export const updateApprovedPOProcessing = async (req, res) => {
  try {
    const {
      processingStatus,
      processedDate,
      processingRemarks,
      deliveryDate,
      trackingStatus,
    } = req.body;

    const allowedStatuses = ["Pending", "Processed", "Delayed", "Not Processed"];

    if (processingStatus && !allowedStatuses.includes(processingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid processing status",
      });
    }

    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (!order.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Only approved purchase orders can be processed",
      });
    }

    const updateData = {};

    if (processingStatus) {
      updateData.processingStatus = processingStatus;

      if (processingStatus === "Processed") {
        updateData.processedBy = getUserId(req);
        updateData.processedDate = processedDate || new Date();
        updateData.status = "In Progress";
        updateData.activityStatus = "Ordered";
        updateData.trackingStatus = trackingStatus || "Processed";
      }

      if (processingStatus === "Delayed") {
        updateData.trackingStatus = "Delayed";
      }

      if (processingStatus === "Not Processed") {
        updateData.trackingStatus = "Approved";
        updateData.processedBy = null;
        updateData.processedDate = null;
      }

      if (processingStatus === "Pending") {
        updateData.trackingStatus = "Approved";
        updateData.processedBy = null;
        updateData.processedDate = null;
      }
    }

    if (processedDate !== undefined) {
      updateData.processedDate = processedDate || null;
    }

    if (deliveryDate !== undefined) {
      updateData.deliveryDate = deliveryDate || null;
    }

    if (processingRemarks !== undefined) {
      updateData.processingRemarks = processingRemarks;
    }

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation");

    return res.status(200).json({
      success: true,
      message: "Approved PO processing updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update approved PO processing",
      error: error.message,
    });
  }
};

export const getPurchaseDashboard = async (req, res) => {
  try {
    const { fromDate, toDate, category, status } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (category && category !== "All Category") {
      filter.category = category;
    }

    if (status && status !== "All Status") {
      if (status === "Approved") {
        filter.isApproved = true;
      } else {
        filter.status = status;
      }
    }

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalPOReceived = orders.length;

    const pendingApproval = orders.filter((po) => !po.isApproved).length;

    const approvedOrders = orders.filter((po) => po.isApproved).length;

    const inProcessing = orders.filter(
      (po) => po.status === "In Progress" || po.processingStatus === "Processed"
    ).length;

    const completedOrders = orders.filter(
      (po) => po.status === "Completed"
    ).length;

    const totalPOValueRaw = orders.reduce(
      (sum, po) => sum + Number(po.poValue || 0),
      0
    );

    const latestPO = orders.slice(0, 5).map((po) => ({
      _id: po._id,
      id: po.poNo,
      poNo: po.poNo,
      company: po.companyName,
      companyName: po.companyName,
      category: po.category,
      value: formatMoney(po.poValue),
      poValue: po.poValue,
      poDate: po.poDate,
      isApproved: po.isApproved,
      status: po.isApproved ? "Approved" : po.status,
      processingStatus: po.processingStatus,
      action: po.isApproved ? "Process" : "View",
    }));

    const poHistory = orders.map((po) => ({
      _id: po._id,
      id: po.poNo,
      poNo: po.poNo,
      company: po.companyName,
      companyName: po.companyName,
      category: po.category,
      value: formatMoney(po.poValue),
      poValue: po.poValue,
      poDate: po.poDate,
      delivery: po.expectedDeliveryDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      deliveryDate: po.deliveryDate,
      isApproved: po.isApproved,
      status: po.isApproved ? "Approved" : po.status,
      processingStatus: po.processingStatus,
    }));

    return res.status(200).json({
      success: true,
      cards: {
        totalPOReceived,
        pendingApproval,
        approvedOrders,
        inProcessing,
        completedOrders,
        totalPOValue: formatMoney(totalPOValueRaw),
      },
      latestPO,
      poHistory,
      chart: {
        monthly: [
          { month: "Dec '23", pending: 52, inProgress: 34, completed: 28 },
          { month: "Jan '24", pending: 46, inProgress: 31, completed: 67 },
          { month: "Feb '24", pending: 47, inProgress: 44, completed: 67 },
          { month: "Mar '24", pending: 55, inProgress: 71, completed: 90 },
          { month: "Apr '24", pending: 60, inProgress: 84, completed: 87 },
          { month: "May '24", pending: 40, inProgress: 65, completed: 55 },
        ],
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purchase dashboard",
      error: error.message,
    });
  }
};

export const getNewPurchaseOrders = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalValue = orders.reduce(
      (sum, order) => sum + Number(order.poValue || 0),
      0
    );

    const uniqueCompanies = new Set(
      orders.map((order) => order.companyName)
    ).size;

    return res.status(200).json({
      success: true,
      cards: {
        totalNewPO: orders.length,
        pendingReview: orders.filter((order) => !order.isApproved).length,
        approvedOrders: orders.filter((order) => order.isApproved).length,
        uniqueCompanies,
        totalPOValue: formatMoney(totalValue),
      },
      rows: orders.map((order) => ({
        _id: order._id,
        poNo: order.poNo,
        poDate: order.poDate,
        company: order.companyName,
        companyName: order.companyName,
        category: order.category,
        edd: order.expectedDeliveryDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        poValue: order.poValue,
        status: order.status,
        isApproved: order.isApproved,
        approvalRemarks: order.approvalRemarks,
        approvedDate: order.approvedDate,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch new purchase orders",
      error: error.message,
    });
  }
};

export const getProcessingPurchaseOrders = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const filter = {
      isApproved: true,
      processingStatus: {
        $in: ["Pending", "Processed", "Delayed", "Not Processed"],
      },
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation")
      .sort({ poDate: -1 });

    return res.status(200).json({
      success: true,
      cards: {
        totalToProcess: orders.length,
        pendingProcess: orders.filter((o) => o.processingStatus === "Pending")
          .length,
        processed: orders.filter((o) => o.processingStatus === "Processed")
          .length,
        delayed: orders.filter((o) => o.processingStatus === "Delayed").length,
        notProcessed: orders.filter(
          (o) => o.processingStatus === "Not Processed"
        ).length,
      },
      rows: orders.map((order) => ({
        _id: order._id,
        poNo: order.poNo,
        poDate: order.poDate,
        company: order.companyName,
        companyName: order.companyName,
        vendorName: order.vendorName,
        vendorCompany: order.vendorName || order.companyName,
        category: order.category,
        edd: order.expectedDeliveryDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        poValue: order.poValue,
        status: order.status,
        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        approvalRemarks: order.approvalRemarks,
        processingStatus: order.processingStatus,
        processedBy: order.processedBy,
        processedDate: order.processedDate,
        processingRemarks: order.processingRemarks,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch processing purchase orders",
      error: error.message,
    });
  }
};

export const getApprovedPurchaseOrders = async (req, res) => {
  try {
    const { fromDate, toDate, processingStatus, teamMemberId, search } =
      req.query;

    const filter = {
      category: { $in: ["Manufacturing", "Service"] },
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (processingStatus && processingStatus !== "All") {
      filter.processingStatus = processingStatus;
    }

    if (teamMemberId && teamMemberId !== "All") {
      filter.processedBy = teamMemberId;
    }

    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation")
      .sort({ poDate: -1 });

    const totalValue = orders.reduce(
      (sum, order) => sum + Number(order.poValue || 0),
      0
    );

    const approvedPOs = orders.filter((order) => order.isApproved).length;

    const notApprovedPOs = orders.filter((order) => !order.isApproved).length;

    const processedPOs = orders.filter(
      (order) => order.processingStatus === "Processed"
    ).length;

    const pendingProcess = orders.filter(
      (order) => order.processingStatus === "Pending"
    ).length;

    const notProcessedOrDelayed = orders.filter((order) =>
      ["Not Processed", "Delayed"].includes(order.processingStatus)
    ).length;

    return res.status(200).json({
      success: true,
      cards: {
        totalApprovedPOs: orders.length, // frontend already using this key
        totalPOs: orders.length,
        approvedPOs,
        notApprovedPOs,
        processedPOs,
        pendingProcess,
        notProcessedOrDelayed,
        totalPOValue: formatMoney(totalValue),
      },
      rows: orders.map((order) => ({
        _id: order._id,
        poNo: order.poNo,

        vendorCompany: order.vendorName || order.companyName,
        vendorName: order.vendorName || "",
        companyName: order.companyName,

        poDate: order.poDate,
        poValue: order.poValue,

        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        approvalRemarks: order.approvalRemarks || "",

        processingStatus: order.processingStatus || "Pending",
        processedBy: order.processedBy,
        processedDate: order.processedDate,
        processingRemarks: order.processingRemarks || "",

        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,

        trackingStatus: order.trackingStatus,
        trackingRemarks: order.trackingRemarks || "",

        remarks: order.remarks || "",
        category: order.category,
        status: order.status,
        createdBy: order.createdBy,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch manufacturing/service purchase orders",
      error: error.message,
    });
  }
};

export const getMyDailyActivityOrders = async (req, res) => {
  try {
    const { fromDate, toDate, status, delay, search } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (status && status !== "All") {
      filter.activityStatus = status;
    }

    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
      ];
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("createdBy", "name email designation role subRole")
      .sort({ poDate: -1 });

    const rows = orders
      .map((order) => {
        const delayInfo = getDelayInfo(order);

        return {
          _id: order._id,
          poNo: order.poNo,
          companyName: order.companyName,
          category: order.category,
          poValue: order.poValue,
          poDate: order.poDate,
          expectedDeliveryDate: order.expectedDeliveryDate,
          deliveryDate: order.deliveryDate,
          status: order.status,
          isApproved: order.isApproved,
          activityStatus: order.activityStatus || "Not Ordered",
          remarks: order.remarks || "",
          createdBy: order.createdBy,
          delayStatus: delayInfo.delayStatus,
          delayDays: delayInfo.delayDays,
          delayType: delayInfo.delayType,
        };
      })
      .filter((order) => {
        if (!delay || delay === "All") return true;
        return order.delayType === delay;
      });

    const totalPOReceived = rows.length;

    const completed = rows.filter(
      (order) => order.activityStatus === "Material Received"
    ).length;

    const inProgress = rows.filter(
      (order) => order.activityStatus === "Ordered"
    ).length;

    const delayed = rows.filter(
      (order) => order.delayType === "delayed"
    ).length;

    const notOrdered = rows.filter(
      (order) => order.activityStatus === "Not Ordered"
    ).length;

    return res.status(200).json({
      success: true,
      cards: {
        totalPOReceived,
        completed,
        inProgress,
        delayed,
        notOrdered,
      },
      rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch daily activity orders",
      error: error.message,
    });
  }
};

export const updateMyDailyActivityOrder = async (req, res) => {
  try {
    const { activityStatus, deliveryDate, remarks } = req.body;

    const allowedStatuses = [
      "Not Ordered",
      "Ordered",
      "Material Received",
      "Invoiced",
    ];

    if (activityStatus && !allowedStatuses.includes(activityStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid activity status",
      });
    }

    const updateData = {};

    if (activityStatus) updateData.activityStatus = activityStatus;

    if (deliveryDate !== undefined) {
      updateData.deliveryDate = deliveryDate || null;
    }

    if (remarks !== undefined) updateData.remarks = remarks;

    const order = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Activity updated successfully",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update activity",
      error: error.message,
    });
  }
};

const trackingSteps = [
  "Approved",
  "Processed",
  "In Transit",
  "Delivered",
  "Invoiced",
  "Payment Received",
];

const getTrackingDelayInfo = (order) => {
  if (!order.expectedDeliveryDate) {
    return {
      delayType: "pending",
      delayText: "Pending",
    };
  }

  const expected = new Date(order.expectedDeliveryDate);
  const compare = order.deliveryDate ? new Date(order.deliveryDate) : new Date();

  expected.setHours(0, 0, 0, 0);
  compare.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (compare.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays > 0) {
    return {
      delayType: "delayed",
      delayText: `${diffDays} day${diffDays > 1 ? "s" : ""} Delayed`,
    };
  }

  return {
    delayType: "onTime",
    delayText: "On Time",
  };
};

const getTrackingProgress = (trackingStatus = "Not Approved") => {
  if (trackingStatus === "Not Approved") return 0;
  if (trackingStatus === "Delayed") return 0;

  const index = trackingSteps.indexOf(trackingStatus);
  return index >= 0 ? index + 1 : 0;
};

export const getPOTrackingOrders = async (req, res) => {
  try {
    const { fromDate, toDate, status, vendor, search } = req.query;

    const filter = {};

    if (fromDate || toDate) {
      filter.poDate = {};

      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        filter.poDate.$gte = from;
      }

      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        filter.poDate.$lte = to;
      }
    }

    if (status && status !== "All") {
      filter.trackingStatus = status;
    }

    if (vendor && vendor !== "All") {
      filter.$or = [
        { vendorName: { $regex: vendor, $options: "i" } },
        { companyName: { $regex: vendor, $options: "i" } },
      ];
    }

    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
      ];
    }

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const rows = orders.map((order) => {
      const delayInfo = getTrackingDelayInfo(order);
      const trackingStatus = order.trackingStatus || "Not Approved";

      return {
        _id: order._id,
        poNo: order.poNo,
        vendorCompany: order.vendorName || order.companyName,
        companyName: order.companyName,
        vendorName: order.vendorName || "",
        poDate: order.poDate,
        poValue: order.poValue,
        currentStatus: trackingStatus,
        progress: getTrackingProgress(trackingStatus),
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        delayType: delayInfo.delayType,
        delayText: delayInfo.delayText,
        trackingRemarks: order.trackingRemarks || "",
        isApproved: order.isApproved,
        processingStatus: order.processingStatus,
      };
    });

    const totalPOs = rows.length;

    const completed = rows.filter(
      (item) => item.currentStatus === "Payment Received"
    ).length;

    const inProcess = rows.filter(
      (item) =>
        !["Not Approved", "Delayed", "Payment Received"].includes(
          item.currentStatus
        )
    ).length;

    const delayed = rows.filter((item) => item.delayType === "delayed").length;

    const notApproved = rows.filter(
      (item) => item.currentStatus === "Not Approved"
    ).length;

    return res.status(200).json({
      success: true,
      cards: {
        totalPOs,
        completed,
        inProcess,
        delayed,
        notApproved,
      },
      rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch PO tracking orders",
      error: error.message,
    });
  }
};

export const updatePOTrackingOrder = async (req, res) => {
  try {
    const { trackingStatus, deliveryDate, paymentReceivedDate, trackingRemarks } =
      req.body;

    const allowedStatuses = [
      "Not Approved",
      "Approved",
      "Processed",
      "In Transit",
      "Delivered",
      "Invoiced",
      "Payment Received",
      "Delayed",
    ];

    if (trackingStatus && !allowedStatuses.includes(trackingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tracking status",
      });
    }

    const updateData = {};

    if (trackingStatus) {
      updateData.trackingStatus = trackingStatus;

      if (trackingStatus === "Approved") {
        updateData.isApproved = true;
        updateData.status = "Approved";
        updateData.approvedBy = getUserId(req);
        updateData.approvedDate = new Date();
      }

      if (trackingStatus === "Processed") {
        updateData.processingStatus = "Processed";
        updateData.processedBy = getUserId(req);
        updateData.processedDate = new Date();
        updateData.status = "In Progress";
        updateData.activityStatus = "Ordered";
      }

      if (trackingStatus === "Delayed") {
        updateData.processingStatus = "Delayed";
      }
    }

    if (deliveryDate !== undefined) {
      updateData.deliveryDate = deliveryDate || null;
    }

    if (paymentReceivedDate !== undefined) {
      updateData.paymentReceivedDate = paymentReceivedDate || null;
    }

    if (trackingRemarks !== undefined) {
      updateData.trackingRemarks = trackingRemarks;
    }

    const order = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "PO tracking updated successfully",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update PO tracking",
      error: error.message,
    });
  }
};

export const getPurchasePlanningTrackingOrders = async (req, res) => {
  try {
    const { fromDate, toDate, approvalStatus, search } = req.query;

    const filter = {
      category: "Trading",
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (approvalStatus === "Approved") {
      filter.isApproved = true;
    }

    if (approvalStatus === "Not Approved") {
      filter.isApproved = false;
    }

    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
      ];
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation")
      .populate("createdBy", "name email designation")
      .sort({ poDate: -1 });

    const totalTradingPOs = orders.length;

    const approvedPOs = orders.filter((order) => order.isApproved).length;

    const notApprovedPOs = orders.filter((order) => !order.isApproved).length;

    const totalPOValue = orders.reduce(
      (sum, order) => sum + Number(order.poValue || 0),
      0
    );

    const pendingPOs = orders.filter(
      (order) => order.status === "Pending" || !order.isApproved
    ).length;

    return res.status(200).json({
      success: true,
      cards: {
        totalTradingPOs,
        approvedPOs,
        notApprovedPOs,
        pendingPOs,
        totalPOValue: formatMoney(totalPOValue),
      },
      rows: orders.map((order) => ({
        _id: order._id,
        poNo: order.poNo,
        vendorCompany: order.vendorName || order.companyName,
        vendorName: order.vendorName || "",
        companyName: order.companyName,
        category: order.category,
        poDate: order.poDate,
        poValue: order.poValue,
        status: order.status,
        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        approvalRemarks: order.approvalRemarks || "",
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        trackingStatus: order.trackingStatus,
        processingStatus: order.processingStatus,
        createdBy: order.createdBy,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purchase planning tracking orders",
      error: error.message,
    });
  }
};

export const updatePurchasePlanningApproval = async (req, res) => {
  try {
    const { isApproved, approvalRemarks } = req.body;

    if (typeof isApproved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isApproved must be true or false",
      });
    }

    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      category: "Trading",
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Trading purchase order not found",
      });
    }

    const updateData = {
      isApproved,
      approvalRemarks: approvalRemarks || "",
      status: isApproved ? "Approved" : "Pending",
      trackingStatus: isApproved ? "Approved" : "Not Approved",
      approvedBy: isApproved ? getUserId(req) : null,
      approvedDate: isApproved ? new Date() : null,
    };

    if (!isApproved) {
      updateData.processingStatus = "Pending";
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
    }

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("approvedBy", "name email designation")
      .populate("createdBy", "name email designation");

    return res.status(200).json({
      success: true,
      message: isApproved
        ? "Purchase order approved successfully"
        : "Purchase order marked as not approved",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update purchase planning approval",
      error: error.message,
    });
  }
};


export const updatePOActionStatus = async (req, res) => {
  try {
    const { action, remarks } = req.body;

    const allowedActions = [
      "approve",
      "reject",
      "invoiced",
      "delivered",
      "completed",
      "payment_received",
    ];

    if (!action || !allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    if (!remarks || !remarks.trim()) {
      return res.status(400).json({
        success: false,
        message: "Remarks are required",
      });
    }

    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const updateData = {};

    if (action === "approve") {
      updateData.isApproved = true;
      updateData.status = "Approved";
      updateData.trackingStatus = "Approved";
      updateData.approvedBy = getUserId(req);
      updateData.approvedDate = new Date();
      updateData.approvalRemarks = remarks.trim();
    }

    if (action === "reject") {
      updateData.isApproved = false;
      updateData.status = "Pending";
      updateData.trackingStatus = "Not Approved";
      updateData.processingStatus = "Pending";
      updateData.approvedBy = null;
      updateData.approvedDate = null;
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.approvalRemarks = remarks.trim();
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
    }

    if (action === "invoiced") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be invoiced",
        });
      }

      updateData.activityStatus = "Invoiced";
      updateData.trackingStatus = "Invoiced";
      updateData.processingStatus = "Processed";
      updateData.status = "In Progress";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = remarks.trim();
      updateData.trackingRemarks = remarks.trim();
    }

    if (action === "delivered") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be delivered",
        });
      }

      updateData.deliveryDate = new Date();
      updateData.activityStatus = "Material Received";
      updateData.trackingStatus = "Delivered";
      updateData.processingStatus = "Processed";
      updateData.status = "In Progress";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = remarks.trim();
      updateData.trackingRemarks = remarks.trim();
    }

    if (action === "completed") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be completed",
        });
      }

      updateData.status = "Completed";
      updateData.trackingStatus = "Delivered";
      updateData.processingStatus = "Processed";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = remarks.trim();
      updateData.trackingRemarks = remarks.trim();
    }

    if (action === "payment_received") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can receive payment",
        });
      }

      updateData.status = "Completed";
      updateData.trackingStatus = "Payment Received";
      updateData.processingStatus = "Processed";
      updateData.paymentReceivedDate = new Date();
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = remarks.trim();
      updateData.trackingRemarks = remarks.trim();
    }

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("approvedBy", "name email designation")
      .populate("processedBy", "name email designation")
      .populate("createdBy", "name email designation");

    return res.status(200).json({
      success: true,
      message: "PO action updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update PO action",
      error: error.message,
    });
  }
};