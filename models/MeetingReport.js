import mongoose from "mongoose";

const meetingReportSchema = new mongoose.Schema(
  {
    meeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    meetingDateTime: {
      type: Date,
      required: true,
    },
    meetingPurpose: {
      type: String,
      default: "",
      trim: true,
    },
    leadStatus: {
      type: String,
      enum: ["hot", "warm", "cold"],
      required: true,
    },
    expectedDealValue: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

const MeetingReport = mongoose.model("MeetingReport", meetingReportSchema);

export default MeetingReport;