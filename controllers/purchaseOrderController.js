import PurchaseOrder from "../models/PurchaseOrder.js";
import { getSocketIO } from "../socket.js";

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
      filter[field].$gte = new Date(fromDate + "T00:00:00");
    }

    if (toDate) {
      filter[field].$lte = new Date(toDate + "T23:59:59.999");
    }
  }

  return filter;
};

const getDelayInfo = (order) => {
  if (!order.deliveryDate) {
    return {
      delayStatus: "Pending",
      delayDays: 0,
      delayType: "pending",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliveryDate = new Date(order.deliveryDate);
  deliveryDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (today.getTime() - deliveryDate.getTime()) /
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
    const dueDays = Math.abs(diffDays);
    return {
      delayStatus: `Due in ${dueDays} day${dueDays > 1 ? "s" : ""}`,
      delayDays: diffDays,
      delayType: "ontime",
    };
  }

  return {
    delayStatus: "Today",
    delayDays: 0,
    delayType: "ontime",
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

    const existingPO = await PurchaseOrder.findOne({
      poNo: { $regex: `^${poNo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    if (existingPO) {
      return res.status(409).json({
        success: false,
        message: "PO number already exists",
      });
    }

    const poCategory = category?.trim() || "Trading";
    const approvedValue = poCategory === "Trading"
      ? true
      : Boolean(isApproved || status === "Approved");

    const finalProcessingStatus = processingStatus || "Pending";
    const shouldSetProcessedBy = finalProcessingStatus === "Processed";

    const purchaseOrder = await PurchaseOrder.create({
      poNo: poNo.trim(),
      companyName: companyName.trim(),
      category: poCategory,
      poValue: Number(poValue),
      poDate,
      expectedDeliveryDate: expectedDeliveryDate || null,
      deliveryDate: deliveryDate || null,
      deliveryDateDeadline: poCategory === "Trading"
        ? new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
        : null,

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

    const io = getSocketIO();
    if (io) {
      const dept = purchaseOrder.category === "Trading" ? "Sales" : (purchaseOrder.category === "Purchase" ? "Purchase" : null);
      io.to("room:admin").emit("po:updated", { type: "created", poId: purchaseOrder._id, poValue: purchaseOrder.poValue });
      io.to("room:radmin").emit("po:updated", { type: "created", poValue: purchaseOrder.poValue });
      if (dept) io.to(`dept:${dept}`).emit("po:updated", { type: "created", poValue: purchaseOrder.poValue });
    }

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

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "updated", poId: order._id, poValue: order.poValue });
      io.to("room:radmin").emit("po:updated", { type: "updated", poValue: order.poValue });
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

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "updated", poId: updatedOrder._id, poValue: updatedOrder.poValue });
      io.to("room:radmin").emit("po:updated", { type: "updated", poValue: updatedOrder.poValue });
    }

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

    const orders = await PurchaseOrder.find(filter).sort({ _id: -1 });

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

    const orders = await PurchaseOrder.find(filter).sort({ _id: -1 });

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
      .sort({ _id: -1 });

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
    const { fromDate, toDate, processingStatus, teamMemberId, search, category } =
      req.query;

    const filter = {
      category: { $in: ["Manufacturing", "Service", "Services"] },
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (category && category !== "All") {
      filter.category =
        category === "Service" || category === "Services"
          ? { $in: ["Service", "Services"] }
          : category;
    }

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
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .sort({ _id: -1 });

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
        totalApprovedPOs: orders.length,
        totalPOs: orders.length,
        approvedPOs,
        notApprovedPOs,
        processedPOs,
        pendingProcess,
        notProcessedOrDelayed,
        totalPOValue: formatMoney(totalValue),
      },
      rows: orders.map((order) => {
        const statusLogs = Array.isArray(order.statusLogs)
          ? order.statusLogs
          : [];

        const latestLog =
          statusLogs.length > 0 ? statusLogs[statusLogs.length - 1] : null;

        return {
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

          activityStatus: order.activityStatus || "Not Ordered",
          processingStatus: order.processingStatus || "Pending",
          processedBy: order.processedBy,
          processedDate: order.processedDate,
          processingRemarks: order.processingRemarks || "",

          expectedDeliveryDate: order.expectedDeliveryDate,
          deliveryDate: order.deliveryDate,
          paymentReceivedDate: order.paymentReceivedDate,

          trackingStatus: order.trackingStatus,
          trackingRemarks: order.trackingRemarks || "",

          remarks: order.remarks || "",
          latestRemark: latestLog?.remark || order.remarks || "",
          statusLogs,
          category: order.category,
          status: order.status,
          createdBy: order.createdBy,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
      }),
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
      category: "Trading",
      isApproved: true,
    };

    if (fromDate || toDate) {
      const dateFilter = {};
      if (fromDate) dateFilter.$gte = new Date(fromDate + "T00:00:00");
      if (toDate) dateFilter.$lte = new Date(toDate + "T23:59:59.999");
      filter.$or = [
        { poDate: dateFilter },
        { deliveryDate: dateFilter },
      ];
    }

    if (status && status !== "All") {
      filter.activityStatus = status;
    }

    if (search) {
      const searchFilter = {
        $or: [
          { poNo: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
          { vendorName: { $regex: search, $options: "i" } },
        ],
      };

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchFilter];
        delete filter.$or;
      } else {
        filter.$or = searchFilter.$or;
      }
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("createdBy", "name email designation role subRole")
      .populate("approvedBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .sort({ _id: -1 });

    const rows = orders
      .map((order) => {
        const delayInfo = getDelayInfo(order);
        const statusLogs = Array.isArray(order.statusLogs)
          ? order.statusLogs
          : [];

        const latestLog =
          statusLogs.length > 0 ? statusLogs[statusLogs.length - 1] : null;

        return {
          _id: order._id,
          poNo: order.poNo,
          companyName: order.companyName,
          vendorName: order.vendorName || "",
          category: order.category,
          poValue: order.poValue,
          poDate: order.poDate,
          expectedDeliveryDate: order.expectedDeliveryDate,
          deliveryDate: order.deliveryDate,
          status: order.status,
          isApproved: order.isApproved,
          approvedBy: order.approvedBy,
          approvedDate: order.approvedDate,
          approvalRemarks: order.approvalRemarks || "",
          activityStatus: order.activityStatus || "Not Ordered",
          remarks: order.remarks || "",
          latestRemark: latestLog?.remark || order.remarks || "",
          statusLogs,
          createdBy: order.createdBy,
          delayStatus: delayInfo.delayStatus,
          delayDays: delayInfo.delayDays,
          delayType: delayInfo.delayType,
          deliveryDateDeadline: order.deliveryDateDeadline,
        };
      })
      .filter((order) => {
        if (!delay || delay === "All") return true;
        return order.delayType === delay;
      });

    const totalPOReceived = rows.length;

    const completed = rows.filter((order) =>
      ["Material Received", "Invoiced", "Delivered", "Payment Received", "Completed"].includes(
        order.activityStatus
      )
    ).length;

    const inProgress = rows.filter((order) =>
      ["Ordered", "Approved", "Processed", "In Transit"].includes(
        order.activityStatus
      )
    ).length;

    const delayed = rows.filter(
      (order) => order.delayType === "delayed" || order.activityStatus === "Delayed"
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
    const { activityStatus, deliveryDate, paymentReceivedDate, remarks } =
      req.body;

    const allowedStatuses = [
      "Not Ordered",
      "Ordered",
      "Material Dispatched by Supplier",
      "Material Received",
      "Material Dispatch",
      "Material In Transit",
      "Material Received at Customer End",
      "Delivered",
      "Payment Received",
    ];

    if (!activityStatus) {
      return res.status(400).json({
        success: false,
        message: "Activity status is required",
      });
    }

    if (!allowedStatuses.includes(activityStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid activity status",
      });
    }

    const cleanRemark = remarks?.trim();

    if (!cleanRemark) {
      return res.status(400).json({
        success: false,
        message: "Remark is required for status update",
      });
    }

    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      category: "Trading",
      isApproved: true,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Approved trading purchase order not found",
      });
    }

    if (!order.deliveryDate && order.deliveryDateDeadline && new Date() > new Date(order.deliveryDateDeadline)) {
      return res.status(400).json({
        success: false,
        message: "Delivery date deadline has expired. Please contact admin to reset the timer.",
      });
    }

    const hasDeliveryDate = Boolean(order.deliveryDate) || Boolean(deliveryDate);

    if (!hasDeliveryDate && activityStatus !== "Not Ordered") {
      return res.status(400).json({
        success: false,
        message: "Please add delivery date before updating status.",
      });
    }

    const oldStatus = order.activityStatus || "Not Ordered";

    const updateData = {
      activityStatus,
      remarks: cleanRemark,
    };

    if (activityStatus === "Not Ordered") {
      updateData.status = "Approved";
      updateData.trackingStatus = "Approved";
      updateData.processingStatus = "Pending";
    }

    if (activityStatus === "Ordered") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "In Progress";
      updateData.processingStatus = "Processed";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
    }

    if (activityStatus === "Material Dispatched by Supplier") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "In Transit";
      updateData.processingStatus = "Processed";
    }

    if (activityStatus === "Material Received") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "In Transit";
      updateData.processingStatus = "Processed";
      updateData.deliveryDate = deliveryDate || new Date();
    }

    if (activityStatus === "Material Dispatch") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "In Transit";
      updateData.processingStatus = "Processed";
    }

    if (activityStatus === "Material In Transit") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "In Transit";
      updateData.processingStatus = "Processed";
    }

    if (activityStatus === "Material Received at Customer End") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "Delivered";
      updateData.processingStatus = "Processed";
      updateData.deliveryDate = deliveryDate || new Date();
    }

    if (activityStatus === "Delivered") {
      updateData.status = "In Progress";
      updateData.trackingStatus = "Delivered";
      updateData.processingStatus = "Processed";
      updateData.deliveryDate = deliveryDate || new Date();
    }

    if (activityStatus === "Payment Received") {
      updateData.status = "Completed";
      updateData.trackingStatus = "Completed";
      updateData.processingStatus = "Processed";
    }

    if (deliveryDate !== undefined) {
      updateData.deliveryDate = deliveryDate || null;
    }

    if (paymentReceivedDate !== undefined) {
      updateData.paymentReceivedDate = paymentReceivedDate || null;
    }

    const userName =
      req.user?.name || req.user?.username || req.user?.email || "Unknown User";

    const userRole =
      req.user?.designation || req.user?.subRole || req.user?.role || "";

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: updateData,
        $push: {
          statusLogs: {
            oldStatus,
            newStatus: activityStatus,
            remark: cleanRemark,
            updatedBy: getUserId(req),
            updatedByName: userName,
            updatedByRole: userRole,
            updatedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    )
      .populate("createdBy", "name email designation role subRole")
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole");

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "updated", poId: updatedOrder._id, poValue: updatedOrder.poValue });
      io.to("room:radmin").emit("po:updated", { type: "updated", poValue: updatedOrder.poValue });
    }

    return res.status(200).json({
      success: true,
      message: "Activity updated successfully",
      order: updatedOrder,
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
  "Invoiced",
  "Payment Received",
  "Delivered",
  "Completed",
];

const getTrackingDelayInfo = (order) => {
  const info = getDelayInfo(order);

  if (info.delayType === "delayed") {
    return {
      delayType: "delayed",
      delayText: `${info.delayDays} day${info.delayDays > 1 ? "s" : ""} Delayed`,
    };
  }

  if (info.delayType === "early") {
    return {
      delayType: "onTime",
      delayText: "On Time",
    };
  }

  if (info.delayType === "onTime") {
    return {
      delayType: "onTime",
      delayText: "On Time",
    };
  }

  return {
    delayType: "pending",
    delayText: "Pending",
  };
};

const getTrackingProgress = (trackingStatus = "Not Approved") => {
  if (trackingStatus === "Not Approved") return 0;
  if (trackingStatus === "Delayed") return 0;
  if (trackingStatus === "Approved") return 1;
  if (trackingStatus === "Processed") return 2;
  if (trackingStatus === "In Transit") return 3;
  if (trackingStatus === "Invoiced") return 4;
  if (trackingStatus === "Payment Received") return 5;
  if (trackingStatus === "Delivered") return 6;
  if (trackingStatus === "Completed") return 7;
  return 0;
};

export const getPOTrackingOrders = async (req, res) => {
  try {
    const { fromDate, toDate, status, vendor, search } = req.query;

    const filter = {
      category: "Trading",
    };

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
      const vendorFilter = [
        { vendorName: { $regex: vendor, $options: "i" } },
        { companyName: { $regex: vendor, $options: "i" } },
      ];

      if (filter.$and) {
        filter.$and.push({ $or: vendorFilter });
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: vendorFilter }];
        delete filter.$or;
      } else {
        filter.$or = vendorFilter;
      }
    }

    if (search) {
      const searchFilter = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
      ];

      if (filter.$and) {
        filter.$and.push({ $or: searchFilter });
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    const orders = await PurchaseOrder.find(filter).sort({ _id: -1 });

    const rows = orders.map((order) => {
      const delayInfo = getTrackingDelayInfo(order);
      const trackingStatus = order.trackingStatus || "Not Approved";

      return {
        _id: order._id,
        poNo: order.poNo,
        category: order.category,
        vendorCompany: order.vendorName || order.companyName,
        companyName: order.companyName,
        vendorName: order.vendorName || "",
        poDate: order.poDate,
        poValue: order.poValue,
        currentStatus: trackingStatus,
        progress: getTrackingProgress(trackingStatus),
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        deliveryDateDeadline: order.deliveryDateDeadline,
        delayType: delayInfo.delayType,
        delayText: delayInfo.delayText,
        trackingRemarks: order.trackingRemarks || "",
        isApproved: order.isApproved,
        processingStatus: order.processingStatus,
        statusLogs: order.statusLogs || [],
      };
    });

    const totalPOs = rows.length;

    const completed = rows.filter(
      (item) => item.currentStatus === "Completed"
    ).length;

    const inProcess = rows.filter(
      (item) =>
        !["Not Approved", "Delayed", "Completed"].includes(
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

export const getPpcPlanningTrackingOrders = async (req, res) => {
  try {
    const { fromDate, toDate, approvalStatus, search, category, vendorFilter } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (category && category !== "All" && category !== "All Categories") {
      filter.category = category;
    } else {
      filter.category = { $in: ["Service", "Services", "Manufacturing"] };
    }

    if (approvalStatus === "Approved") {
      filter.isApproved = true;
    } else if (approvalStatus === "Not Approved") {
      filter.isApproved = false;
    }

    const andConditions = [];

    if (search) {
      andConditions.push({
        $or: [
          { poNo: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
          { vendorName: { $regex: search, $options: "i" } },
          { status: { $regex: search, $options: "i" } },
          { activityStatus: { $regex: search, $options: "i" } },
          { trackingStatus: { $regex: search, $options: "i" } },
          { processingStatus: { $regex: search, $options: "i" } },
        ],
      });
    }

    if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "All Vendors") {
      andConditions.push({
        $or: [
          { companyName: vendorFilter },
          { vendorName: vendorFilter },
        ],
      });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .sort({ _id: -1 });

    const totalPOs = orders.length;
    const approvedPOs = orders.filter((o) => o.isApproved).length;
    const notApprovedPOs = orders.filter((o) => !o.isApproved).length;
    const pendingPOs = orders.filter((o) => o.status === "Pending" || !o.isApproved).length;
    const totalPOValue = orders.reduce((sum, o) => sum + Number(o.poValue || 0), 0);

    return res.status(200).json({
      success: true,
      cards: {
        totalTradingPOs: totalPOs,
        approvedPOs,
        notApprovedPOs,
        pendingPOs,
        totalPOValue: formatMoney(totalPOValue),
      },
      rows: orders.map((order) => ({
        _id: order._id,
        poNo: order.poNo,
        companyName: order.companyName,
        vendorCompany: order.vendorName || order.companyName,
        vendorName: order.vendorName || "",
        category: order.category,
        poValue: order.poValue,
        formattedPOValue: formatMoney(order.poValue),
        poDate: order.poDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        paymentReceivedDate: order.paymentReceivedDate,
        status: order.status,
        activityStatus: order.activityStatus,
        trackingStatus: order.trackingStatus,
        processingStatus: order.processingStatus,
        currentStatus: order.trackingStatus || order.activityStatus || order.processingStatus || order.status,
        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        approvalRemarks: order.approvalRemarks || "",
        processedBy: order.processedBy,
        processedDate: order.processedDate,
        processingRemarks: order.processingRemarks || "",
        trackingRemarks: order.trackingRemarks || "",
        remarks: order.remarks || "",
        createdBy: order.createdBy,
        statusLogs: Array.isArray(order.statusLogs) ? order.statusLogs : [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch PPC planning tracking orders",
      error: error.message,
    });
  }
};

export const updatePpcPlanningApproval = async (req, res) => {
  try {
    const { isApproved, approvalRemarks, deliveryDate } = req.body;

    if (typeof isApproved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isApproved must be true or false",
      });
    }

    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      category: { $in: ["Service", "Services", "Manufacturing"] },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Service purchase order not found",
      });
    }

    if (isApproved && order.isApproved && order.deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date already fixed and approved. Cannot modify.",
      });
    }

    if (isApproved && !deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date is required to approve",
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

    if (isApproved && deliveryDate) {
      updateData.deliveryDate = new Date(deliveryDate);
      updateData.activityStatus = "Ordered";
    }

    if (!isApproved) {
      updateData.processingStatus = "Pending";
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
      updateData.deliveryDate = null;
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
        ? "Purchase order approved successfully with delivery date"
        : "Purchase order marked as not approved",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update PPC planning approval",
      error: error.message,
    });
  }
};

export const getPpcTrackingOrders = async (req, res) => {
  try {
    const { fromDate, toDate, status, vendor, search } = req.query;

    const filter = {
      category: { $in: ["Service", "Services", "Manufacturing"] },
    };

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
      const vendorFilter = [
        { vendorName: { $regex: vendor, $options: "i" } },
        { companyName: { $regex: vendor, $options: "i" } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: vendorFilter }];
        delete filter.$or;
      } else {
        filter.$or = vendorFilter;
      }
    }

    if (search) {
      const searchFilter = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
      ];
      if (filter.$and) {
        filter.$and.push({ $or: searchFilter });
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    const orders = await PurchaseOrder.find(filter).sort({ _id: -1 });

    const rows = orders.map((order) => {
      const delayInfo = getTrackingDelayInfo(order);
      const trackingStatus = order.trackingStatus || "Not Approved";

      return {
        _id: order._id,
        poNo: order.poNo,
        category: order.category,
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
        statusLogs: order.statusLogs || [],
      };
    });

    return res.status(200).json({
      success: true,
      cards: {
        totalPOs: rows.length,
        completed: rows.filter((r) => r.currentStatus === "Completed").length,
        inProcess: rows.filter((r) => !["Not Approved", "Delayed", "Completed"].includes(r.currentStatus)).length,
        delayed: rows.filter((r) => r.delayType === "delayed").length,
        notApproved: rows.filter((r) => r.currentStatus === "Not Approved").length,
      },
      rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch PPC tracking orders",
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
      "Invoiced",
      "Payment Received",
      "Delivered",
      "Completed",
      "Delayed",
    ];

    if (trackingStatus && !allowedStatuses.includes(trackingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tracking status",
      });
    }

    const existingOrder = await PurchaseOrder.findById(req.params.id);

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (!existingOrder.isApproved && trackingStatus !== "Not Approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved purchase orders can have tracking updated",
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

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "updated", poId: order._id, poValue: order.poValue });
      io.to("room:radmin").emit("po:updated", { type: "updated", poValue: order.poValue });
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
    const { fromDate, toDate, approvalStatus, search, category, vendorFilter } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    // Category filter: when not provided, default to "Trading" for backward compat
    if (category && category !== "All" && category !== "All Categories") {
      filter.category = category;
    } else if (!category) {
      filter.category = "Trading";
    }

    if (approvalStatus === "Approved") {
      filter.isApproved = true;
    }

    if (approvalStatus === "Not Approved") {
      filter.isApproved = false;
    }

    const andConditions = [];

    if (search) {
      andConditions.push({
        $or: [
          { poNo: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
          { vendorName: { $regex: search, $options: "i" } },
          { status: { $regex: search, $options: "i" } },
          { activityStatus: { $regex: search, $options: "i" } },
          { trackingStatus: { $regex: search, $options: "i" } },
          { processingStatus: { $regex: search, $options: "i" } },
        ],
      });
    }

    if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "All Vendors") {
      andConditions.push({
        $or: [
          { companyName: vendorFilter },
          { vendorName: vendorFilter },
        ],
      });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .sort({ _id: -1 });

    const totalTradingPOs = orders.length;
    const approvedPOs = orders.filter((order) => order.isApproved).length;
    const notApprovedPOs = orders.filter((order) => !order.isApproved).length;
    const pendingPOs = orders.filter(
      (order) => order.status === "Pending" || !order.isApproved
    ).length;

    const totalPOValue = orders.reduce(
      (sum, order) => sum + Number(order.poValue || 0),
      0
    );

    return res.status(200).json({
      success: true,
      cards: {
        totalTradingPOs,
        approvedPOs,
        notApprovedPOs,
        pendingPOs,
        totalPOValue: formatMoney(totalPOValue),
      },
      rows: orders.map((order) => {
        const statusLogs = Array.isArray(order.statusLogs)
          ? order.statusLogs
          : [];

        const latestLog =
          statusLogs.length > 0 ? statusLogs[statusLogs.length - 1] : null;

        return {
          _id: order._id,

          poNo: order.poNo,
          companyName: order.companyName,
          vendorCompany: order.vendorName || order.companyName,
          vendorName: order.vendorName || "",
          category: order.category,

          poValue: order.poValue,
          formattedPOValue: formatMoney(order.poValue),

          poDate: order.poDate,
          expectedDeliveryDate: order.expectedDeliveryDate,
          deliveryDate: order.deliveryDate,
          paymentReceivedDate: order.paymentReceivedDate,

          // Real PO statuses
          status: order.status,
          activityStatus: order.activityStatus,
          trackingStatus: order.trackingStatus,
          processingStatus: order.processingStatus,
          currentStatus:
            order.trackingStatus ||
            order.activityStatus ||
            order.processingStatus ||
            order.status,

          isApproved: order.isApproved,
          approvedBy: order.approvedBy,
          approvedDate: order.approvedDate,
          approvalRemarks: order.approvalRemarks || "",

          processedBy: order.processedBy,
          processedDate: order.processedDate,
          processingRemarks: order.processingRemarks || "",

          trackingRemarks: order.trackingRemarks || "",
          remarks: order.remarks || "",
          latestRemark: latestLog?.remark || order.remarks || "",

          createdBy: order.createdBy,
          statusLogs,

          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
      }),
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
    const { isApproved, approvalRemarks, deliveryDate } = req.body;

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

    if (isApproved && order.isApproved && order.deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date already fixed and approved. Cannot modify.",
      });
    }

    if (isApproved && !deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date is required to approve",
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

    if (isApproved && deliveryDate) {
      updateData.deliveryDate = new Date(deliveryDate);
      updateData.activityStatus = "Ordered";
    }

    if (!isApproved) {
      updateData.processingStatus = "Pending";
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
      updateData.deliveryDate = null;
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
        ? "Purchase order approved successfully with delivery date"
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

const normalizePOAction = (value) => {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases = {
    approve: "approve",
    approved: "approve",
    reject: "reject",
    rejected: "reject",
    not_approved: "reject",
    not_started: "not_started",
    not_ordered: "not_started",
    pending: "not_started",
    in_progress: "in_progress",
    process: "processed",
    processed: "processed",
    ordered: "processed",
    in_transit: "processed",
    material_received: "delivered",
    delay: "delayed",
    delayed: "delayed",
    not_processed: "not_processed",
    invoiced: "invoiced",
    delivered: "delivered",
    completed: "completed",
    payment_received: "payment_received",
  };

  return aliases[key] || key;
};

export const updatePOActionStatus = async (req, res) => {
  try {
    const {
      action: requestedAction,
      status,
      activityStatus,
      processingStatus,
      remarks,
    } = req.body;

    const action = normalizePOAction(
      requestedAction || status || activityStatus || processingStatus
    );

    const allowedActions = [
      "approve",
      "reject",
      "not_started",
      "in_progress",
      "processed",
      "delayed",
      "not_processed",
      "invoiced",
      "delivered",
      "completed",
      "payment_received",
      "ready_to_dispatch",
      "dispatched",
      "handover",
    ];

    if (!action || !allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid action${requestedAction ? `: ${requestedAction}` : ""}`,
      });
    }

    const cleanRemarks = remarks?.trim();

    if (!cleanRemarks) {
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
    const oldStatus =
      order.activityStatus ||
      order.processingStatus ||
      order.trackingStatus ||
      order.status ||
      "";

    const actionLabels = {
      approve: "Approved",
      reject: "Not Approved",
      not_started: "Not Started",
      in_progress: "In Progress",
      processed: "Processed",
      delayed: "Delayed",
      not_processed: "Not Processed",
      invoiced: "Invoiced",
      delivered: "Delivered",
      completed: "Completed",
      payment_received: "Completed & Payment Received",
    };

    if (action === "approve") {
      const { deliveryDate } = req.body;
      if (!deliveryDate) {
        return res.status(400).json({
          success: false,
          message: "Delivery date is required to approve",
        });
      }
      updateData.isApproved = true;
      updateData.status = "Approved";
      updateData.trackingStatus = "Approved";
      updateData.approvedBy = getUserId(req);
      updateData.approvedDate = new Date();
      updateData.approvalRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
      updateData.deliveryDate = new Date(deliveryDate);
    }

    if (action === "reject") {
      if (order.isApproved && order.deliveryDate) {
        return res.status(400).json({
          success: false,
          message: "Delivery date already fixed. Cannot reject.",
        });
      }
      updateData.isApproved = false;
      updateData.status = "Pending";
      updateData.trackingStatus = "Not Approved";
      updateData.processingStatus = "Pending";
      updateData.approvedBy = null;
      updateData.approvedDate = null;
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.approvalRemarks = cleanRemarks;
      updateData.processingRemarks = "";
      updateData.activityStatus = "Not Ordered";
      updateData.remarks = cleanRemarks;
    }

    if (action === "not_started" || action === "not_processed") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be updated",
        });
      }

      updateData.activityStatus = "Not Ordered";
      updateData.trackingStatus = "Approved";
      updateData.processingStatus =
        action === "not_processed" ? "Not Processed" : "Pending";
      updateData.status = "Approved";
      updateData.processedBy = null;
      updateData.processedDate = null;
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    if (action === "in_progress" || action === "processed") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be processed",
        });
      }

      updateData.activityStatus = "Processed";
      updateData.trackingStatus = "Processed";
      updateData.processingStatus = "Processed";
      updateData.status = "In Progress";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    if (action === "delay" || action === "delayed") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be delayed",
        });
      }

      updateData.activityStatus = "Delayed";
      updateData.trackingStatus = "Delayed";
      updateData.processingStatus = "Delayed";
      updateData.status = "In Progress";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
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
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    if (action === "delivered") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be delivered",
        });
      }

      updateData.deliveryDate = new Date();
      updateData.activityStatus = "Delivered";
      updateData.trackingStatus = "Delivered";
      updateData.processingStatus = "Processed";
      updateData.status = "In Progress";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    if (action === "completed") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can be completed",
        });
      }

      updateData.status = "Completed";
      updateData.trackingStatus = "Completed";
      updateData.activityStatus = "Completed";
      updateData.processingStatus = "Processed";
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    if (action === "payment_received") {
      if (!order.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Only approved purchase orders can receive payment",
        });
      }

      updateData.status = "In Progress";
      updateData.trackingStatus = "Payment Received";
      updateData.activityStatus = "Payment Received";
      updateData.processingStatus = "Processed";
      updateData.paymentReceivedDate = new Date();
      updateData.processedBy = getUserId(req);
      updateData.processedDate = new Date();
      updateData.processingRemarks = cleanRemarks;
      updateData.trackingRemarks = cleanRemarks;
      updateData.remarks = cleanRemarks;
    }

    const userName =
      req.user?.name || req.user?.username || req.user?.email || "Unknown User";

    const userRole =
      req.user?.designation || req.user?.subRole || req.user?.role || "";

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: updateData,
        $push: {
          statusLogs: {
            oldStatus,
            newStatus: actionLabels[action] || action,
            remark: cleanRemarks,
            updatedBy: getUserId(req),
            updatedByName: userName,
            updatedByRole: userRole,
            updatedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    )
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole");

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "updated", poId: updatedOrder._id, poValue: updatedOrder.poValue });
      io.to("room:radmin").emit("po:updated", { type: "updated", poValue: updatedOrder.poValue });
    }

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

export const getSalesManagerPOTrackingOrders = async (req, res) => {
  try {
    const isSalesManager =
      req.user?.role === "subadmin" && req.user?.subRole === "sales_manager";

    const isAdmin = ["admin", "superadmin", "radmin"].includes(req.user?.role);

    if (!isSalesManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { fromDate, toDate, category, status, search } = req.query;

    const filter = {
      ...getDateRangeFilter(fromDate, toDate, "poDate"),
    };

    if (category && category !== "All" && category !== "all") {
      filter.category = category;
    }

    if (status && status !== "All" && status !== "all") {
      filter.$or = [
        { trackingStatus: status },
        { status },
        { processingStatus: status },
        { activityStatus: status },
      ];
    }

    if (search) {
      const searchFilter = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { trackingStatus: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ];

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("createdBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .sort({ _id: -1 });

    const rows = orders.map((order) => {
      const statusLogs = Array.isArray(order.statusLogs)
        ? order.statusLogs
        : [];

      const latestLog =
        statusLogs.length > 0 ? statusLogs[statusLogs.length - 1] : null;

      return {
        _id: order._id,

        poNo: order.poNo,
        companyName: order.companyName,
        vendorCompany: order.vendorName || order.companyName,
        vendorName: order.vendorName || "",
        category: order.category,

        poValue: order.poValue,
        formattedPOValue: formatMoney(order.poValue),

        poDate: order.poDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,

        status: order.status,
        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        approvalRemarks: order.approvalRemarks || "",

        activityStatus: order.activityStatus,

        processingStatus: order.processingStatus,
        processedBy: order.processedBy,
        processedDate: order.processedDate,
        processingRemarks: order.processingRemarks || "",

        trackingStatus: order.trackingStatus,
        currentStatus: order.trackingStatus || order.status,
        trackingRemarks: order.trackingRemarks || "",

        paymentReceivedDate: order.paymentReceivedDate,

        createdBy: order.createdBy,
        remarks: order.remarks || "",
        latestRemark: latestLog?.remark || order.remarks || "",
        statusLogs,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    const totalPOValue = rows.reduce(
      (sum, order) => sum + Number(order.poValue || 0),
      0
    );

    return res.status(200).json({
      success: true,
      cards: {
        totalPOs: rows.length,
        trading: rows.filter((item) => item.category === "Trading").length,
        manufacturing: rows.filter((item) => item.category === "Manufacturing")
          .length,
        service: rows.filter((item) => item.category === "Service").length,
        approved: rows.filter((item) => item.isApproved).length,
        notApproved: rows.filter((item) => !item.isApproved).length,
        completed: rows.filter((item) => item.status === "Completed").length,
        totalPOValue: formatMoney(totalPOValue),
      },
      rows,
    });
  } catch (error) {
    console.error("getSalesManagerPOTrackingOrders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch sales manager PO tracking orders",
      error: error.message,
    });
  }
};

export const getAllPurchaseOrders = async (req, res) => {
  try {
    const { fromDate, toDate, status, category, search } = req.query;

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

    if (category && category !== "All") {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
      ];
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("createdBy", "name email designation role subRole")
      .populate("approvedBy", "name email designation role subRole")
      .populate("processedBy", "name email designation role subRole")
      .populate("statusLogs.updatedBy", "name email designation role subRole")
      .sort({ _id: -1 });

    const rows = orders.map((order) => {
      const delayInfo = getDelayInfo(order);
      const statusLogs = Array.isArray(order.statusLogs) ? order.statusLogs : [];
      const latestLog = statusLogs.length > 0 ? statusLogs[statusLogs.length - 1] : null;

      return {
        _id: order._id,
        poNo: order.poNo,
        companyName: order.companyName,
        vendorName: order.vendorName || "",
        category: order.category,
        poValue: order.poValue,
        poDate: order.poDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        deliveryDate: order.deliveryDate,
        deliveryDateDeadline: order.deliveryDateDeadline,
        status: order.status,
        isApproved: order.isApproved,
        approvedBy: order.approvedBy,
        approvedDate: order.approvedDate,
        activityStatus: order.activityStatus || "Not Ordered",
        trackingStatus: order.trackingStatus || "Not Approved",
        processingStatus: order.processingStatus,
        remarks: order.remarks || "",
        latestRemark: latestLog?.remark || order.remarks || "",
        statusLogs,
        createdBy: order.createdBy,
        delayStatus: delayInfo.delayStatus,
        delayDays: delayInfo.delayDays,
        delayType: delayInfo.delayType,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    const totalPOValue = rows.reduce((sum, order) => sum + Number(order.poValue || 0), 0);

    return res.status(200).json({
      success: true,
      cards: {
        totalPOs: rows.length,
        trading: rows.filter((item) => item.category === "Trading").length,
        manufacturing: rows.filter((item) => item.category === "Manufacturing").length,
        service: rows.filter((item) => item.category === "Service" || item.category === "Services").length,
        approved: rows.filter((item) => item.isApproved).length,
        notApproved: rows.filter((item) => !item.isApproved).length,
        completed: rows.filter((item) => item.status === "Completed").length,
        totalPOValue: formatMoney(totalPOValue),
      },
      rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all purchase orders",
      error: error.message,
    });
  }
};

export const resetDeliveryTimer = async (req, res) => {
  try {
    const { resetDays } = req.body;
    const days = Number(resetDays) || 4;

    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const newDeadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const userName = req.user?.name || req.user?.username || req.user?.email || "Unknown User";
    const userRole = req.user?.designation || req.user?.subRole || req.user?.role || "";

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          deliveryDateDeadline: newDeadline,
        },
        $push: {
          statusLogs: {
            oldStatus: "Timer Reset",
            newStatus: "Timer Reset",
            remark: `Delivery date timer reset by ${userName} for ${days} days`,
            updatedBy: getUserId(req),
            updatedByName: userName,
            updatedByRole: userRole,
            updatedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Delivery date timer reset for ${days} days`,
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reset delivery timer",
      error: error.message,
    });
  }
};

export const setDeliveryDate = async (req, res) => {
  try {
    const { deliveryDate } = req.body;

    if (!deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date is required",
      });
    }

    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      category: "Trading",
      isApproved: true,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Approved trading purchase order not found",
      });
    }

    if (order.deliveryDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date is already set for this PO",
      });
    }

    if (order.deliveryDateDeadline && new Date() > new Date(order.deliveryDateDeadline)) {
      return res.status(400).json({
        success: false,
        message: "Delivery date deadline has expired. Please contact admin to reset the timer.",
      });
    }

    const userName = req.user?.name || req.user?.username || req.user?.email || "Unknown User";
    const userRole = req.user?.designation || req.user?.subRole || req.user?.role || "";

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          deliveryDate: new Date(deliveryDate),
          activityStatus: "Not Ordered",
        },
        $push: {
          statusLogs: {
            oldStatus: "Awaiting Delivery Date",
            newStatus: "Delivery Date Set",
            remark: `Delivery date set to ${new Date(deliveryDate).toLocaleDateString("en-IN")} by ${userName}`,
            updatedBy: getUserId(req),
            updatedByName: userName,
            updatedByRole: userRole,
            updatedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Delivery date set successfully",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to set delivery date",
      error: error.message,
    });
  }
};

export const cancelPO = async (req, res) => {
  try {
    const { cancelRemark } = req.body;

    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (order.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Purchase order is already cancelled",
      });
    }

    if (order.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed purchase order",
      });
    }

    const userName = req.user?.name || req.user?.username || req.user?.email || "Unknown User";
    const userRole = req.user?.designation || req.user?.subRole || req.user?.role || "";

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "Cancelled",
          activityStatus: "Cancelled",
          trackingStatus: "Cancelled",
          processingStatus: "Not Processed",
        },
        $push: {
          statusLogs: {
            oldStatus: order.status,
            newStatus: "Cancelled",
            remark: cancelRemark ? `PO Cancelled: ${cancelRemark}` : "PO Cancelled",
            updatedBy: getUserId(req),
            updatedByName: userName,
            updatedByRole: userRole,
            updatedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    const io = getSocketIO();
    if (io) {
      io.to("room:admin").emit("po:updated", { type: "cancelled", poId: updatedOrder._id });
      io.to("room:radmin").emit("po:updated", { type: "cancelled", poId: updatedOrder._id });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to cancel purchase order",
      error: error.message,
    });
  }
};
