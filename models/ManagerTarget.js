import mongoose from "mongoose";

const managerTargetSchema = new mongoose.Schema(
  {
    manager: {
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
    },

    targetAmount: {
      type: Number,
      required: true,
      default: 0,
    },

    selfTarget: {
      type: Number,
      default: 0,
    },

    teamTarget: {
      type: Number,
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

managerTargetSchema.index(
  { manager: 1, period: 1, periodKey: 1 },
  { unique: true }
);

const ManagerTarget = mongoose.model("ManagerTarget", managerTargetSchema);

export default ManagerTarget;
