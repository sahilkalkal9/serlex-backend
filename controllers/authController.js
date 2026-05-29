import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Activity from "../models/Activity.js";

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      employeeId: user.employeeId,
      email: user.email,
      role: user.role,
      subRole: user.subRole || "",
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export const signup = async (req, res) => {
  try {
    const {
      name,
      email,
      employeeId,
      mobileNumber,
      department,
      designation,
      managerName,
      territory,
      joiningDate,
      username,
      dob,
      signupLocation,
      role,
      subRole,
      pin,
    } = req.body;

    if (
      !name ||
      !email ||
      !employeeId ||
      !mobileNumber ||
      !department ||
      !designation ||
      !joiningDate ||
      !username ||
      !dob
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields are mandatory",
      });
    }

    if (role === "subadmin" && !subRole) {
      return res.status(400).json({
        success: false,
        message: "Sub role is required for subadmin",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "User already exists with this email, employee ID, or username",
      });
    }

    const defaultPassword = "123456";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const hashedPin = pin ? await bcrypt.hash(pin, 10) : "";

    const user = await User.create({
      name,
      email,
      employeeId,
      mobileNumber,
      department,
      designation,
      managerName,
      territory,
      joiningDate,
      username,
      dob,
      password: hashedPassword,
      role: role || "sales_user",
      subRole: role === "subadmin" ? subRole : "",
      isApprovedByAdmin: false,
      pin: hashedPin,
    });

    // Don't create Activity here — login will create it after first manual login

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        mobileNumber: user.mobileNumber,
        department: user.department,
        designation: user.designation,
        managerName: user.managerName,
        territory: user.territory,
        joiningDate: user.joiningDate,
        username: user.username,
        dob: user.dob,
        role: user.role,
        subRole: user.subRole || "",
        pin: pin ? "Set" : "Not Set",
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during signup",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { employeeId, password, loginLocation } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and password are required",
      });
    }

    const user = await User.findOne({ employeeId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.pin);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!["superadmin", "admin"].includes(user.role) && !user.isApprovedByAdmin) {
      return res.status(403).json({
        success: false,
        message: "Account pending admin approval. Please contact your administrator.",
      });
    }

    const activeSession = await Activity.findOne({
      user: user._id,
      logoutTime: null,
      loginTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (activeSession) {
      return res.status(409).json({
        success: false,
        message: "Already logged in on another device. Please logout from there first.",
      });
    }

    await Activity.create({
      user: user._id,
      loginTime: new Date(),
      loginLocation: {
        name: loginLocation?.name || "",
        coordinates: {
          latitude: loginLocation?.coordinates?.latitude ?? null,
          longitude: loginLocation?.coordinates?.longitude ?? null,
        },
      },
    });

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        mobileNumber: user.mobileNumber,
        department: user.department,
        designation: user.designation,
        managerName: user.managerName,
        territory: user.territory,
        joiningDate: user.joiningDate,
        username: user.username,
        dob: user.dob,
        role: user.role,
        subRole: user.subRole || "",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};


export const getSalesTeamUsers = async (req, res) => {
  try {
    const users = await User.find({
      status: { $ne: "inactive" },
      $or: [
        { role: "sales_user" },
        { role: "subadmin", subRole: "sales_manager" },
      ],
    })
      .select("name email employeeId mobileNumber department designation role subRole")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getSalesTeamUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch sales team users",
    });
  }
};

export const getPurchaseTeamUsers = async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { role: "purchase_user" },
        { role: "subadmin", subRole: "purchase_manager" },
      ],
    })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getPurchaseTeamUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching purchase team users",
    });
  }
};

export const getPpcTeamUsers = async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { role: "ppc_user" },
        { role: "subadmin", subRole: "ppc_manager" },
      ],
    })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getPpcTeamUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching PPC team users",
    });
  }
};