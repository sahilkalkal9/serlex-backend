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
  },
  { timestamps: true }
);

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;