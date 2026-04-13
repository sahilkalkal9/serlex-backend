import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    coordinates: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    loginTime: {
      type: Date,
      default: null,
    },
    logoutTime: {
      type: Date,
      default: null,
    },
    loginLocation: {
      type: locationSchema,
      default: () => ({
        name: "",
        coordinates: {
          latitude: null,
          longitude: null,
        },
      }),
    },
    logoutLocation: {
      type: locationSchema,
      default: () => ({
        name: "",
        coordinates: {
          latitude: null,
          longitude: null,
        },
      }),
    },
  },
  {
    timestamps: true,
  }
);

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;