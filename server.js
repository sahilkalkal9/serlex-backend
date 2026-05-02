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
import salesUserRoutes from "./routes/salesUserRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://your-frontend-domain.com",
  "https://crm.techvrm.com",
  "https://serlex-frontend.vercel.app",
  "https://serlex-main-frontend.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  });
});

app.get("/api/health", (req, res) => {
  console.log("✅ Health API hit:", new Date().toLocaleString("en-IN"));

  res.status(200).json({
    success: true,
    message: "Server Active",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/meeting-reports", meetingReportRoutes);
app.use("/api/sales-users", salesUserRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/vendors", vendorRoutes);

const getSelfPingUrl = () => {
  const selfUrl = process.env.SELF_URL;

  if (!selfUrl) return null;

  const cleanUrl = selfUrl.trim().replace(/\/$/, "");

  if (cleanUrl.endsWith("/api/health")) {
    return cleanUrl;
  }

  return `${cleanUrl}/api/health`;
};

const startSelfPingCron = () => {
  const selfPingUrl = getSelfPingUrl();

  if (!selfPingUrl) {
    console.log("⚠️ SELF_URL not found in env. Self ping disabled.");
    return;
  }

  console.log("✅ Self ping URL:", selfPingUrl);

  cron.schedule(
    "*/1 * * * *",
    async () => {
      try {
        const { data } = await axios.get(selfPingUrl, {
          timeout: 20000,
        });

        console.log(
          "🔁 Self ping success:",
          data.message,
          new Date().toLocaleString("en-IN")
        );
      } catch (error) {
        console.log(
          "❌ Self ping failed:",
          error.response?.status || "",
          error.response?.statusText || error.message
        );
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Kolkata",
    }
  );

  console.log("✅ Self ping cron started. Runs every 1 minute.");
};

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      startSelfPingCron();
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
  });