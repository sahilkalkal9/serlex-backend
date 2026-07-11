import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

const SALT_ROUNDS = 10;

const testUsers = [
  {
    name: "Test Sales Executive",
    email: "test.executive@serlex.com",
    employeeId: "STE01",
    mobileNumber: "9999999991",
    department: "Sales",
    designation: "Sales Executive",
    managerName: "",
    territory: "Test Territory",
    joiningDate: new Date("2025-01-01"),
    username: "STE01",
    dob: new Date("1995-01-01"),
    role: "sales_user",
    subRole: "",
    pin: "123456",
  },
  {
    name: "Test Sales Manager",
    email: "test.manager@serlex.com",
    employeeId: "STM01",
    mobileNumber: "9999999992",
    department: "Sales",
    designation: "Sales Manager",
    managerName: "",
    territory: "Test Territory",
    joiningDate: new Date("2025-01-01"),
    username: "STM01",
    dob: new Date("1990-01-01"),
    role: "subadmin",
    subRole: "sales_manager",
    pin: "123456",
  },
];

async function seedTestUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    for (const userData of testUsers) {
      const existing = await User.findOne({
        $or: [
          { employeeId: userData.employeeId },
          { email: userData.email },
          { username: userData.username },
        ],
      });

      if (existing) {
        console.log(
          `User ${userData.name} (${userData.employeeId}) already exists, updating pin...`
        );
        const hashedPin = await bcrypt.hash(userData.pin, SALT_ROUNDS);
        existing.pin = hashedPin;
        existing.password = hashedPin;
        existing.status = "approved";
        existing.isApprovedByAdmin = true;
        await existing.save();
        console.log(`Updated pin for ${userData.name}`);
        continue;
      }

      const hashedDefaultPassword = await bcrypt.hash("123456", SALT_ROUNDS);
      const hashedPin = await bcrypt.hash(userData.pin, SALT_ROUNDS);

      const user = await User.create({
        name: userData.name,
        email: userData.email,
        employeeId: userData.employeeId,
        mobileNumber: userData.mobileNumber,
        department: userData.department,
        designation: userData.designation,
        managerName: userData.managerName,
        territory: userData.territory,
        joiningDate: userData.joiningDate,
        username: userData.username,
        dob: userData.dob,
        password: hashedDefaultPassword,
        role: userData.role,
        subRole: userData.subRole,
        status: "approved",
        isApprovedByAdmin: true,
        pin: hashedPin,
      });

      console.log(`Created: ${user.name} (${user.employeeId}) - Role: ${user.role}${user.subRole ? "/" + user.subRole : ""}`);
    }

    console.log("\n--- Test Users Summary ---");
    for (const u of testUsers) {
      console.log(`${u.name}: employeeId=${u.employeeId}, pin=${u.pin}, role=${u.role}${u.subRole ? "/" + u.subRole : ""}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  }
}

seedTestUsers();
