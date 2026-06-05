import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

let io = null;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "https://crm.techvrm.com",
        "https://serlex-frontend.vercel.app",
        "https://serlex-main-frontend.vercel.app",
        "https://serlex-sales-frontend.vercel.app",
        "https://serlex-purchase-frontend.vercel.app",
        "https://serlex-admin-frontend.vercel.app",
        "https://serlex-ppc.vercel.app",
        "https://sales.serlextechnologies.com",
        "https://admin.serlextechnologies.com",
        "https://purchase.serlextechnologies.com",
        "https://ppc.serlextechnologies.com",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = {
        id: user._id.toString(),
        employeeId: user.employeeId,
        role: user.role,
      };

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.user.employeeId} (${socket.id})`);

    socket.join(`user:${socket.user.id}`);

    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected: ${socket.user.employeeId} (${socket.id})`);
    });

    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ status: "ok", timestamp: Date.now() });
      }
    });
  });

  console.log("✅ Socket.IO initialized");
  return io;
};

export const getSocketIO = () => io;