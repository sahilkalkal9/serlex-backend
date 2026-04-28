import Vendor from "../models/Vendor.js";

export const createVendor = async (req, res) => {
  try {
    const {
      vendorName,
      category,
      contactPerson,
      email,
      phone,
      country,
      status,
    } = req.body;

    if (!vendorName || !contactPerson || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Vendor name, contact person, email and phone are required",
      });
    }

    const existingVendor = await Vendor.findOne({ email: email.trim().toLowerCase() });

    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: "Vendor with this email already exists",
      });
    }

    const vendor = await Vendor.create({
      vendorName: vendorName.trim(),
      category: category?.trim().toUpperCase() || "TRADING",
      contactPerson: contactPerson.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      country: country?.trim() || "India",
      status: status || "ACTIVE",
    });

    res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create vendor",
      error: error.message,
    });
  }
};

export const getVendors = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const filter = {};

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);

      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);

      filter.createdAt = { $gte: from, $lte: to };
    }

    const vendors = await Vendor.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      cards: {
        totalVendors: vendors.length,
        activeVendors: vendors.filter((v) => v.status === "ACTIVE").length,
        newVendors: vendors.length,
        blacklistedVendors: vendors.filter((v) => v.status === "BLACKLISTED").length,
      },
      rows: vendors.map((vendor, index) => ({
        sNo: index + 1,
        vendorName: vendor.vendorName,
        category: vendor.category,
        contactPerson: vendor.contactPerson,
        email: vendor.email,
        phone: vendor.phone,
        country: vendor.country,
        status: vendor.status,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
      error: error.message,
    });
  }
};