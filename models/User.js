import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },

    department: {
      type: String,
      required: true,
      trim: true,
      default: "Sales",
    },

    designation: {
      type: String,
      required: true,
      trim: true,
    },

    managerName: {
      type: String,
      trim: true,
      default: "",
    },

    territory: {
      type: String,
      trim: true,
      default: "",
    },

    joiningDate: {
      type: Date,
      required: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    dob: {
      type: Date,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["superadmin", "admin", "subadmin", "sales_user"],
      default: "sales_user",
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;