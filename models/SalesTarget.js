import mongoose from "mongoose";

const salesTargetSchema = new mongoose.Schema(
  {
    salesUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    period: {
      type: String,
      enum: ["Monthly", "Quarterly", "Yearly"],
      default: "Monthly",
      required: true,
    },

    periodKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
      // Monthly: 2026-05
      // Quarterly: 2026-Q2
      // Yearly: 2026
    },

    targetAmount: {
      type: Number,
      required: true,
      default: 0,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

salesTargetSchema.index(
  { salesUser: 1, period: 1, periodKey: 1 },
  { unique: true }
);

const SalesTarget = mongoose.model("SalesTarget", salesTargetSchema);

export default SalesTarget;