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
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export const signup = async (req, res) => {
  try {
    const { name, email, employeeId, dob, signupLocation } = req.body;

    if (!name || !email || !employeeId || !dob) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email or employee ID",
      });
    }

    const defaultPassword = "123456";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const user = await User.create({
      name,
      email,
      employeeId,
      dob,
      password: hashedPassword,
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
        dob: user.dob,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during signup",
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
        dob: user.dob,
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