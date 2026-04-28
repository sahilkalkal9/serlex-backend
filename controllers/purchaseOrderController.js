import PurchaseOrder from "../models/PurchaseOrder.js";

const formatMoney = (amount = 0) => {
  if (amount >= 10000000) return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(2)} L`;
  return `₹ ${Number(amount).toLocaleString("en-IN")}`;
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

    if (category && category !== "All Category") {
      filter.category = category;
    }

    if (status && status !== "All Status") {
      filter.status = status;
    }

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalPOReceived = orders.length;
    const pendingApproval = orders.filter((po) => po.status === "Pending").length;
    const inProcessing = orders.filter((po) => po.status === "In Progress").length;
    const completedOrders = orders.filter((po) => po.status === "Completed").length;
    const totalPOValueRaw = orders.reduce((sum, po) => sum + Number(po.poValue || 0), 0);

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

    const filter = {};

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);

      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);

      filter.poDate = { $gte: from, $lte: to };
    }

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
        pendingReview: orders.filter((order) => order.status === "Pending").length,
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
    };

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);

      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);

      filter.poDate = { $gte: from, $lte: to };
    }

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
      status: "Approved", // 🔥 ONLY APPROVED
    };

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);

      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);

      filter.poDate = { $gte: from, $lte: to };
    }

    const orders = await PurchaseOrder.find(filter).sort({ poDate: -1 });

    const totalValue = orders.reduce(
      (sum, o) => sum + Number(o.poValue || 0),
      0
    );

    const uniqueCompanies = new Set(
      orders.map((o) => o.companyName)
    ).size;

    res.status(200).json({
      success: true,
      cards: {
        totalApprovedOrders: orders.length,
        approvedCompanies: uniqueCompanies,
        totalPOValue: `₹ ${totalValue}`,
        readyForProcessing: orders.filter(
          (o) => o.status === "Approved"
        ).length,
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