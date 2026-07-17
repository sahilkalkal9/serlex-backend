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

    deliveryDateDeadline: {
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
      enum: [
        "Not Ordered",
        "Ordered",
        "Material Received",
        "Approved",
        "Processed",
        "In Transit",
        "Invoiced",
        "Payment Received",
        "Delivered",
        "Completed",
        "Delayed",
      ],
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
        "Invoiced",
        "Payment Received",
        "Delivered",
        "Completed",
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

    statusLogs: [
      {
        oldStatus: {
          type: String,
          default: "",
          trim: true,
        },

        newStatus: {
          type: String,
          required: true,
          trim: true,
        },

        remark: {
          type: String,
          required: true,
          trim: true,
        },

        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },

        updatedByName: {
          type: String,
          default: "",
          trim: true,
        },

        updatedByRole: {
          type: String,
          default: "",
          trim: true,
        },

        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ category: 1, status: 1 });
purchaseOrderSchema.index({ category: 1, isApproved: 1 });
purchaseOrderSchema.index({ category: 1, trackingStatus: 1 });
purchaseOrderSchema.index({ poDate: -1 });
purchaseOrderSchema.index({ vendorName: 1 });
purchaseOrderSchema.index({ companyName: 1 });

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;