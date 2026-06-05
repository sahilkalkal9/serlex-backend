import mongoose from "mongoose";

const userAllocationSchema = new mongoose.Schema(
  {
    salesManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    salesUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    allocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    allocationDate: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    deallocationDate: {
      type: Date,
      default: null,
    },

    deallocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Unique index: one sales user can be allocated to only one manager at a time
userAllocationSchema.index(
  { salesUser: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

// Index for finding all users allocated to a manager
userAllocationSchema.index({ salesManager: 1, isActive: 1 });

const UserAllocation = mongoose.model("UserAllocation", userAllocationSchema);

export default UserAllocation;
