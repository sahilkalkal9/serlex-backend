import User from "../models/User.js";

export const getSalesUsers = async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {
      role: "sales_user",
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
        { department: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getSalesUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching sales users",
    });
  }
};

export const getSalesUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      _id: id,
      role: "sales_user",
    }).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Sales user not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("getSalesUserById error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching sales user",
    });
  }
};

export const updateSalesUser = async (req, res) => {
  try {
    const { id } = req.params;
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
      dob,
      username,
    } = req.body;

    const existingUser = await User.findOne({
      _id: id,
      role: "sales_user",
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Sales user not found",
      });
    }

    if (email && email.trim().toLowerCase() !== existingUser.email) {
      const emailExists = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Another user already exists with this email",
        });
      }
    }

    if (employeeId && employeeId.trim() !== existingUser.employeeId) {
      const employeeExists = await User.findOne({
        employeeId: employeeId.trim(),
        _id: { $ne: id },
      });

      if (employeeExists) {
        return res.status(400).json({
          success: false,
          message: "Another user already exists with this employee ID",
        });
      }
    }

    if (username && username.trim() !== existingUser.username) {
      const usernameExists = await User.findOne({
        username: username.trim(),
        _id: { $ne: id },
      });

      if (usernameExists) {
        return res.status(400).json({
          success: false,
          message: "Another user already exists with this username",
        });
      }
    }

    existingUser.name = name?.trim() || existingUser.name;
    existingUser.email = email?.trim().toLowerCase() || existingUser.email;
    existingUser.employeeId = employeeId?.trim() || existingUser.employeeId;
    existingUser.mobileNumber = mobileNumber?.trim() || existingUser.mobileNumber;
    existingUser.department = department?.trim() || existingUser.department;
    existingUser.designation = designation?.trim() || existingUser.designation;
    existingUser.managerName =
      managerName !== undefined ? managerName.trim() : existingUser.managerName;
    existingUser.territory =
      territory !== undefined ? territory.trim() : existingUser.territory;
    existingUser.joiningDate = joiningDate || existingUser.joiningDate;
    existingUser.dob = dob || existingUser.dob;
    existingUser.username = username?.trim() || existingUser.username;

    await existingUser.save();

    const updatedUser = await User.findById(id).select("-password");

    return res.status(200).json({
      success: true,
      message: "Sales user updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("updateSalesUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating sales user",
    });
  }
};

export const deleteSalesUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existingUser = await User.findOne({
      _id: id,
      role: "sales_user",
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Sales user not found",
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Sales user deleted successfully",
    });
  } catch (error) {
    console.error("deleteSalesUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting sales user",
    });
  }
};