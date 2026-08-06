import mongoose from "mongoose";
import dotenv from "dotenv";
import PurchaseOrder from "./models/PurchaseOrder.js";

dotenv.config();

const SRV_HOST = "serlex.w6bahad.mongodb.net";
const DB_NAME = "CMS";
const REPLICA_SET = "atlas-1nqt8w-shard-0";
const SHARD_HOSTS = [
  "ac-7m8t1wn-shard-00-00.w6bahad.mongodb.net:27017",
  "ac-7m8t1wn-shard-00-01.w6bahad.mongodb.net:27017",
  "ac-7m8t1wn-shard-00-02.w6bahad.mongodb.net:27017",
];

function buildDirectUri() {
  const uri = process.env.MONGO_URI || "";
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/([^@]+)@/);
  const credentials = match ? match[1] : "";
  return `mongodb://${credentials}@${SHARD_HOSTS.join(",")}/${DB_NAME}?replicaSet=${REPLICA_SET}&authSource=admin&tls=true`;
}

async function approveAllOrders() {
  try {
    const directUri = buildDirectUri();
    await mongoose.connect(directUri);
    console.log("Connected to MongoDB");

    const unapproved = await PurchaseOrder.find({ isApproved: { $ne: true } });

    const result = await PurchaseOrder.updateMany(
      { isApproved: { $ne: true } },
      {
        $set: {
          isApproved: true,
          status: "Approved",
          trackingStatus: "Approved",
        },
        $unset: {
          approvedBy: 1,
          approvedDate: 1,
        },
      }
    );

    console.log(`Unapproved orders found: ${unapproved.length}`);
    console.log(`Orders approved now: ${result.matchedCount}`);
    console.log(`Orders modified: ${result.modifiedCount}`);

    await mongoose.disconnect();
    console.log("Done");
  } catch (error) {
    console.error("Failed to approve orders:", error);
    process.exit(1);
  }
}

approveAllOrders();
