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
      required: function () {
        return this.reportType === "client";
      },
      trim: true,
    },
    contactPerson: {
      type: String,
      required: function () {
        return this.reportType === "client";
      },
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: function () {
        return this.reportType === "client";
      },
      trim: true,
    },
    leadStatus: {
      type: String,
      enum: ["hot", "warm", "cold", "converted", "lead_closed"],
      required: function () {
        return this.reportType === "client";
      },
    },
    poReceived: {
      type: Boolean,
      default: false,
    },
    leadClosedRemark: {
      type: String,
      default: "",
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

    expectedDealValue: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    leadId: String,
    poDate: Date,
    poExpectedDeliveryDate: Date,
    category: String,
    paymentTerms: String,
    purchaseOrderNumber: {
      type: String,
      default: "",
      trim: true,
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
    },
    reportType: {
      type: String,
      enum: ["client", "team"],
      default: "client",
    },
    meetingPoints: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

const MeetingReport = mongoose.model("MeetingReport", meetingReportSchema);

export default MeetingReport;