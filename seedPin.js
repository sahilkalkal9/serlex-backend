import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

const EMPLOYEE_ID = "ST62";
const NEW_PIN = "0210";
const SALT_ROUNDS = 10;

async function seedPin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const hashedPin = await bcrypt.hash(NEW_PIN, SALT_ROUNDS);
    console.log("Generated bcrypt hash:", hashedPin);

    const user = await User.findOne({ employeeId: EMPLOYEE_ID });

    if (!user) {
      console.error(`User with employeeId "${EMPLOYEE_ID}" not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.name} (${user.employeeId})`);

    user.password = hashedPin;
    user.pin = hashedPin;

    await user.save();

    console.log(`Successfully updated password & pin for ${user.name}`);
    console.log("Verifying hash match:", await bcrypt.compare(NEW_PIN, user.pin));
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seedPin();
