import mongoose from "mongoose";

const googleTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    accessToken: {
      type: String,
      default: "",
    },
    refreshToken: {
      type: String,
      default: "",
    },
    scope: {
      type: String,
      default: "",
    },
    expiryDate: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

const GoogleToken = mongoose.model("GoogleToken", googleTokenSchema);
export default GoogleToken;