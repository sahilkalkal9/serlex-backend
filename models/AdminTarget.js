import mongoose from "mongoose";

const adminTargetSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  period: {
    type: String,
    enum: ["Monthly", "Quarterly", "Yearly"],
    default: "Monthly",
  },
  periodKey: {
    type: String,
    required: true,
  },
  targetAmount: {
    type: Number,
    default: 0,
  },
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  remarks: {
    type: String,
    default: "",
  },
}, { timestamps: true });

adminTargetSchema.index({ admin: 1, period: 1, periodKey: 1 }, { unique: true });

const AdminTarget = mongoose.model("AdminTarget", adminTargetSchema);
export default AdminTarget;
