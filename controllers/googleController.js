import { google } from "googleapis";
import GoogleToken from "../models/GoogleToken.js";
import { createOAuthClient, getGoogleAuthUrl } from "../utils/googleClient.js";

export const redirectToGoogleAuth = async (req, res) => {
  try {
    const userId = req.user.id;
    const url = getGoogleAuthUrl(userId);

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate Google auth URL",
    });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    const userId = state;
    const oauth2Client = createOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    await GoogleToken.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        accessToken: tokens.access_token || "",
        refreshToken: tokens.refresh_token || "",
        scope: tokens.scope || "",
        expiryDate: tokens.expiry_date || null,
      },
      { upsert: true, new: true }
    );

    return res.redirect(`${process.env.FRONTEND_URL}/planning?google=connected`);
  } catch (error) {
    return res.status(500).send(error.message || "Google auth failed");
  }
};


export const getGoogleConnectionStatus = async (req, res) => {
  try {
    const tokenDoc = await GoogleToken.findOne({ user: req.user.id });

    return res.status(200).json({
      success: true,
      connected: !!tokenDoc,
      email: tokenDoc?.connectedEmail || "",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch Google status",
    });
  }
};