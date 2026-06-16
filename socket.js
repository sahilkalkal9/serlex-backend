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
        "https://serlex-radmin-frontend.vercel.app",
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
        subRole: user.subRole,
        department: user.department,
      };

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role, subRole, department, employeeId } = socket.user;
    console.log(`\u{1F50C} User connected: ${employeeId} (${role}/${subRole}) [${socket.id}]`);

    socket.join(`user:${id}`);

    if (role === "admin" || role === "superadmin") {
      socket.join("room:admin");
    }

    if (role === "radmin") {
      socket.join("room:radmin");
      if (department) socket.join(`dept:${department}`);
    }

    if (role === "subadmin" && subRole) {
      const dept = getDeptFromSubRole(subRole);
      if (dept) socket.join(`dept:${dept}`);
    }

    socket.on("disconnect", () => {
      console.log(`\u{1F50C} User disconnected: ${employeeId} [${socket.id}]`);
    });

    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ status: "ok", timestamp: Date.now() });
      }
    });
  });

  console.log("\u2705 Socket.IO initialized");
  return io;
};

const getDeptFromSubRole = (subRole) => {
  if (subRole?.startsWith("sales")) return "Sales";
  if (subRole?.startsWith("purchase") || subRole?.startsWith("po")) return "Purchase";
  if (subRole?.startsWith("ppc")) return "PPC";
  return null;
};

export const getSocketIO = () => io;