import Activity from "../models/Activity.js";

export const logoutUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { logoutLocation } = req.body;

    const latestActivity = await Activity.findOne({
      user: userId,
      $or: [{ logoutTime: null }, { logoutTime: { $exists: false } }],
    }).sort({ createdAt: -1 });

    if (!latestActivity) {
      return res.status(404).json({
        success: false,
        message: "No active session found",
      });
    }

    latestActivity.logoutTime = new Date();
    latestActivity.logoutLocation = {
      name: logoutLocation?.name || "",
      coordinates: {
        latitude: logoutLocation?.coordinates?.latitude ?? null,
        longitude: logoutLocation?.coordinates?.longitude ?? null,
      },
    };

    await latestActivity.save();

    return res.status(200).json({
      success: true,
      message: "Logout activity updated successfully",
      activity: latestActivity,
    });
  } catch (error) {
    console.error("Logout activity error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while logging out",
    });
  }
};

export const getMyActivities = async (req, res) => {
  try {
    const userId = req.user.id;

    const activities = await Activity.find({ user: userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error("Get activities error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching activities",
    });
  }
};

export const getAllActivities = async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("user", "name email employeeId role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: activities.length,
      activities,
    });
  } catch (error) {
    console.error("Get all activities error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching all activities",
    });
  }
};