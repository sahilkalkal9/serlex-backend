import PurchaseOrder from "../models/PurchaseOrder.js";

const formatMoney = (amount = 0) => {
  if (amount >= 10000000) return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(2)} L`;
  return `₹ ${Number(amount).toLocaleString("en-IN")}`;
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
      activityStatus,
      remarks,
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

    const purchaseOrder = await PurchaseOrder.create({
      poNo: poNo.trim(),
      companyName: companyName.trim(),
      category: category?.trim() || "Trading",
      poValue: Number(poValue),
      poDate,
      expectedDeliveryDate: expectedDeliveryDate || null,
      deliveryDate: deliveryDate || null,
      status: status || "Pending",
      activityStatus: activityStatus || "Not Ordered",
      remarks: remarks || "",
      createdBy: req.user?._id || req.user?.id || null,
    });

    res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      purchaseOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create purchase order",
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
      filter.status = status;
    }

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalPOReceived = orders.length;
    const pendingApproval = orders.filter(
      (po) => po.status === "Pending"
    ).length;
    const inProcessing = orders.filter(
      (po) => po.status === "In Progress"
    ).length;
    const completedOrders = orders.filter(
      (po) => po.status === "Completed"
    ).length;

    const totalPOValueRaw = orders.reduce(
      (sum, po) => sum + Number(po.poValue || 0),
      0
    );

    const latestPO = orders.slice(0, 5).map((po) => ({
      id: po.poNo,
      company: po.companyName,
      category: po.category,
      value: formatMoney(po.poValue),
      poDate: po.poDate,
      status: po.status,
      action:
        po.status === "Approved"
          ? "Process"
          : po.status === "In Progress"
          ? "Track"
          : "View",
    }));

    const poHistory = orders.map((po) => ({
      id: po.poNo,
      company: po.companyName,
      category: po.category,
      value: formatMoney(po.poValue),
      poDate: po.poDate,
      delivery: po.expectedDeliveryDate,
      status: po.status,
    }));

    res.status(200).json({
      success: true,
      cards: {
        totalPOReceived,
        pendingApproval,
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
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      cards: {
        totalNewPO: orders.length,
        pendingReview: orders.filter((order) => order.status === "Pending")
          .length,
        uniqueCompanies,
        totalPOValue: formatMoney(totalValue),
      },
      rows: orders.map((order) => ({
        poNo: order.poNo,
        poDate: order.poDate,
        company: order.companyName,
        category: order.category,
        edd: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        status: order.status,
      })),
    });
  } catch (error) {
    res.status(500).json({
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
      status: "In Progress",
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    res.status(200).json({
      success: true,
      cards: {
        totalToProcess: orders.length,
        inReview: orders.filter((o) => o.status === "Pending").length,
        sentForApproval: orders.filter((o) => o.status === "Approved").length,
        processed: orders.filter((o) => o.status === "Completed").length,
      },
      rows: orders.map((order) => ({
        poNo: order.poNo,
        poDate: order.poDate,
        company: order.companyName,
        category: order.category,
        edd: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        status: order.status,
        assignedTo: order.assignedTo || "Unassigned",
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch processing purchase orders",
      error: error.message,
    });
  }
};

export const getApprovedPurchaseOrders = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const filter = {
      status: "Approved",
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalValue = orders.reduce(
      (sum, o) => sum + Number(o.poValue || 0),
      0
    );

    const uniqueCompanies = new Set(orders.map((o) => o.companyName)).size;

    res.status(200).json({
      success: true,
      cards: {
        totalApprovedOrders: orders.length,
        approvedCompanies: uniqueCompanies,
        totalPOValue: formatMoney(totalValue),
        readyForProcessing: orders.filter((o) => o.status === "Approved")
          .length,
      },
      rows: orders.map((o) => ({
        poNo: o.poNo,
        poDate: o.poDate,
        company: o.companyName,
        category: o.category,
        edd: o.expectedDeliveryDate,
        deliveryDate: o.deliveryDate,
        poValue: o.poValue,
        approvedDate: o.updatedAt,
        approvedBy: o.approvedBy || "Admin",
        status: "Ready",
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch approved orders",
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

    res.status(200).json({
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
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      message: "Activity updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({
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

    res.status(200).json({
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
    res.status(500).json({
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

    if (trackingStatus) updateData.trackingStatus = trackingStatus;
    if (deliveryDate !== undefined) updateData.deliveryDate = deliveryDate || null;
    if (paymentReceivedDate !== undefined) {
      updateData.paymentReceivedDate = paymentReceivedDate || null;
    }
    if (trackingRemarks !== undefined) updateData.trackingRemarks = trackingRemarks;

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

    res.status(200).json({
      success: true,
      message: "PO tracking updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update PO tracking",
      error: error.message,
    });
  }
};