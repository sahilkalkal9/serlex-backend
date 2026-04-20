import { google } from "googleapis";
import GoogleToken from "../models/GoogleToken.js";

export const createOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

export const getGoogleAuthUrl = (userId) => {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: String(userId),
  });
};

export const getAuthorizedOAuthClient = async (userId) => {
  const tokenDoc = await GoogleToken.findOne({ user: userId });

  if (!tokenDoc) {
    throw new Error("Google Calendar not connected");
  }

  const oauth2Client = createOAuthClient();

  oauth2Client.setCredentials({
    access_token: tokenDoc.accessToken,
    refresh_token: tokenDoc.refreshToken,
    scope: tokenDoc.scope,
    expiry_date: tokenDoc.expiryDate,
  });

  return oauth2Client;
};