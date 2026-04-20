import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";
import axios from "axios";

import authRoutes from "./routes/authRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import googleRoutes from "./routes/googleRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import meetingReportRoutes from "./routes/meetingReportRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed frontend origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://your-frontend-domain.com",
  "https://crm.techvrm.com", 
  "https://serlex-frontend.vercel.app"
];



// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Postman / mobile apps / server-to-server requests me origin absent ho sakta hai
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Health check / root route
app.get("/", (req, res) => {
  res.status(200).send("Server is running");
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/meeting-reports", meetingReportRoutes);

// Self-ping cron job to keep server active
// Runs every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  try {
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    await axios.get(baseUrl);
    console.log(`Self ping successful at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("Self ping failed:", error.message);
  }
});

// MongoDB connection and server start
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });