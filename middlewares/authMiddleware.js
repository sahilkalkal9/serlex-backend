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
    // agar kuchh pass hi nahi kiya, to access allow
    if (!allowedRoles || allowedRoles.length === 0) {
      return next();
    }

    // agar array ke andar roles aaye hain, unko flatten kar do
    const roles = allowedRoles.flat();

    // req.user ya role hi missing ho to deny
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: "Access denied: role not found",
      });
    }

    // match check
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied: insufficient permissions",
      });
    }

    next();
  };
};