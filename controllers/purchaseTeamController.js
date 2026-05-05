import bcrypt from "bcryptjs";
import User from "../models/User.js";

const generateEmployeeId = async () => {
  const lastUser = await User.findOne({ role: "purchase_user" })
    .sort({ createdAt: -1 })
    .select("employeeId");

  if (!lastUser?.employeeId) return "PU0001";

  const lastNumber = Number(lastUser.employeeId.replace("PU", "")) || 0;
  return `PU${String(lastNumber + 1).padStart(4, "0")}`;
};

export const getPurchaseTeamMembers = async (req, res) => {
  try {
    const users = await User.find({ role: "purchase_user" })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch purchase team members",
    });
  }
};

export const createPurchaseTeamMember = async (req, res) => {
  try {
    const {
      name,
      email,
      mobileNumber,
      designation,
      joiningDate,
      dob,
      password,
      pin,
      status = "approved",
    } = req.body;

    if (!name || !email || !mobileNumber || !designation || !joiningDate || !dob) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email, mobile number, designation, joining date and DOB are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { mobileNumber }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email or mobile number",
      });
    }

    const employeeId = await generateEmployeeId();
    const username = normalizedEmail.split("@")[0];

    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: "Username already exists. Please use another email.",
      });
    }

    const plainPassword = password || pin || "1234";
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await User.create({
      name,
      email: normalizedEmail,
      employeeId,
      mobileNumber,
      department: "Purchase",
      designation,
      managerName: req.user?.name || "Purchase Manager",
      territory: "",
      joiningDate,
      username,
      dob,
      password: hashedPassword,
      role: "purchase_user",
      subRole: "",
      status,
      pin: pin || "",
    });

    const safeUser = await User.findById(user._id).select("-password");

    return res.status(201).json({
      success: true,
      message: "Purchase team member created successfully",
      user: safeUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create purchase team member",
    });
  }
};

export const updatePurchaseTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const allowedFields = [
      "name",
      "email",
      "mobileNumber",
      "designation",
      "joiningDate",
      "dob",
      "status",
      "pin",
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase().trim();
      updateData.username = updateData.email.split("@")[0];
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: "purchase_user" },
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Purchase team member not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase team member updated successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update purchase team member",
    });
  }
};

export const deletePurchaseTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOneAndDelete({
      _id: id,
      role: "purchase_user",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Purchase team member not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase team member deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete purchase team member",
    });
  }
};