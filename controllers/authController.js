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
        message: "User already exists with this email, employee ID, or username",
      });
    }

    const defaultPassword = "123456";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

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
    });

    await Activity.create({
      user: user._id,
      loginTime: new Date(),
      loginLocation: {
        name: signupLocation?.name || "",
        coordinates: {
          latitude: signupLocation?.coordinates?.latitude ?? null,
          longitude: signupLocation?.coordinates?.longitude ?? null,
        },
      },
    });

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

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
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