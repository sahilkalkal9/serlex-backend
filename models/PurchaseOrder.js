import mongoose from "mongoose";

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    companyName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      default: "Trading",
      trim: true,
    },

    poValue: {
      type: Number,
      required: true,
      default: 0,
    },

    poDate: {
      type: Date,
      required: true,
    },

    expectedDeliveryDate: {
      type: Date,
      default: null,
    },

    deliveryDate: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "In Progress", "Completed"],
      default: "Pending",
    },

    // Separate approval key
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedDate: {
      type: Date,
      default: null,
    },

    approvalRemarks: {
      type: String,
      default: "",
      trim: true,
    },

    activityStatus: {
      type: String,
      enum: ["Not Ordered", "Ordered", "Material Received", "Invoiced"],
      default: "Not Ordered",
    },

    // Approved PO Status tab key
    processingStatus: {
      type: String,
      enum: ["Pending", "Processed", "Delayed", "Not Processed"],
      default: "Pending",
      index: true,
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    processedDate: {
      type: Date,
      default: null,
    },

    processingRemarks: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    trackingStatus: {
      type: String,
      enum: [
        "Not Approved",
        "Approved",
        "Processed",
        "In Transit",
        "Delivered",
        "Invoiced",
        "Payment Received",
        "Delayed",
      ],
      default: "Not Approved",
    },

    vendorName: {
      type: String,
      default: "",
      trim: true,
    },

    paymentReceivedDate: {
      type: Date,
      default: null,
    },

    trackingRemarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;