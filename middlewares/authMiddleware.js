import jwt from "jsonwebtoken";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles || allowedRoles.length === 0) {
      return next();
    }

    const roles = allowedRoles.flat();

    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: "Access denied: role not found",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied: insufficient permissions",
      });
    }

    next();
  };
};

export const authorizeSubRoles = (...allowedSubRoles) => {
  return (req, res, next) => {
    if (!allowedSubRoles || allowedSubRoles.length === 0) {
      return next();
    }

    const subRoles = allowedSubRoles.flat();

    if (!req.user || !req.user.subRole) {
      return res.status(403).json({
        success: false,
        message: "Access denied: sub role not found",
      });
    }

    if (!subRoles.includes(req.user.subRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied: insufficient sub role permissions",
      });
    }

    next();
  };
};