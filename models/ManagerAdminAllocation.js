import mongoose from "mongoose";

const managerAdminAllocationSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  deallocatedAt: {
    type: Date,
  },
  deallocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
}, { timestamps: true });

managerAdminAllocationSchema.index({ admin: 1, manager: 1, isActive: 1 }, { unique: true });
managerAdminAllocationSchema.index({ manager: 1, isActive: 1 });

const ManagerAdminAllocation = mongoose.model("ManagerAdminAllocation", managerAdminAllocationSchema);
export default ManagerAdminAllocation;
