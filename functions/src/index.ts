import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "gondola-bros-hub.firebasestorage.app",
  });
}

const EMBY_API_KEY: string = process.env.EMBY_API_KEY || "";
const EMBY_BASE_URL: string = "https://media.gondolabros.com";
const BUCKET = admin.storage().bucket();

const VALID_MAGIC_BYTES: { [key: string]: number[] } = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/jpg": [0xff, 0xd8, 0xff],
  "image/bmp": [0x42, 0x4d],
};

interface UploadProfileImageData {
  fileName: string;
  contentType: string;
  file: string;
}

interface SetupUserAccountData {
  email: string;
  username: string;
  password: string;
}


interface CheckUsernameData {
  username: string;
}

interface UserDocumentData {
  tokenBalance: number;
  normalizedUsername: string;
  username: string;
  [key: string]: any;
}

interface ProcessTokenPurchaseData {
  userId: string;
  orderId: string;
  sessionId: string;
  tokens: number;
  amount: string;
  currency: string;
}

interface ProcessTokenPurchaseResponse {
  success: boolean;
  orderId: string;
}

interface ProcessTokenTradeData {
  senderId: string;
  receiverUsername: string;
  tokens: number;
}

interface ProcessTokenTradeResponse {
  success: boolean;
}

interface CreatePaypalOrderData {
  userId: string;
  sessionId: string;
  tokens: number;
  amount: string;
  currency: string;
}

interface CreatePaypalOrderResponse {
  orderId: string;
}


interface CreateTipOrderData {
  userId: string;
  sessionId: string;
  amount: string;
  currency: string;
}

interface CreateTipOrderResponse {
  orderId: string;
}

interface ProcessTipData {
  userId: string;
  orderId: string;
  sessionId: string;
  amount: string;
  currency: string;
}

interface ProcessTipResponse {
  success: boolean;
  orderId: string;
}

// Service Handler Interface
interface ServiceHandler {
  createUser(email: string, username: string, normalizedUsername: string, password: string): Promise<string>;
  enableUser(userId: string): Promise<void>;
  disableUser(userId: string): Promise<void>;
  updatePassword(normalizedUsername: string, newPassword: string): Promise<void>;
  updateProfileImage(serviceUserId: string, imageUrl: string, contentType: string): Promise<void>;
  verifyUserExists(serviceUserId: string): Promise<boolean>;
}

// Service Configs
const SERVICES = {
  emby: {
    apiKey: EMBY_API_KEY,
    url: EMBY_BASE_URL,
  },
};

class EmbyService implements ServiceHandler {
  private apiKey: string;
  private url: string;

  constructor(config: { apiKey: string; url: string }) {
    this.apiKey = config.apiKey;
    this.url = config.url;
  }

  private getUserPolicy(isDisabled: boolean, streamLimit: number): any {
    return {
      IsAdministrator: false,
      EnableRemoteAccess: true,
      EnableMediaPlayback: true,
      EnableAudioPlaybackTranscoding: true,
      EnableVideoPlaybackTranscoding: true,
      EnablePlaybackRemuxing: true,
      EnableLiveTvAccess: false,
      EnableLiveTvManagement: false,
      SimultaneousStreamLimit: streamLimit,
      RemoteClientBitrateLimit: 0,
      EnableContentDeletion: false,
      RestrictedFeatures: ["notifications"],
      EnableRemoteControlOfOtherUsers: false,
      EnableSharedDeviceControl: false,
      EnableContentDownloading: false,
      EnableSyncTranscoding: false,
      EnableSubtitleDownloading: false,
      EnableSubtitleManagement: false,
      AllowCameraUpload: false,
      EnableMediaConversion: false,
      EnablePublicSharing: false,
      EnableSocialSharing: false,
      EnableUserPreferenceAccess: false,
      IsDisabled: isDisabled,
      IsHidden: true,
      IsHiddenRemotely: false,
      IsHiddenFromUnusedDevices: true,
      EnableAllFolders: true,
      EnableAllChannels: true,
    };
  }

  async createUser(email: string, username: string, normalizedUsername: string, password: string): Promise<string> {
    console.log(`Creating Emby user with normalizedUsername: ${normalizedUsername}, email: ${email}`);
    const createUserResponse = await fetch(`${this.url}/Users/New`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Token": this.apiKey,
      },
      body: JSON.stringify({ Name: username }),
    });

    if (!createUserResponse.ok) {
      const errorText = await createUserResponse.text();
      console.error(`Failed to create Emby user: Status ${createUserResponse.status} - ${errorText}`);
      throw new Error(`Failed to create Emby user: Status ${createUserResponse.status} - ${errorText}`);
    }

    const userDto = await createUserResponse.json();
    const serviceUserId = userDto.Id;
    console.log(`Emby user created successfully with serviceUserId: ${serviceUserId}`);

    console.log(`Setting password for serviceUserId: ${serviceUserId}`);
    const passwordResponse = await fetch(`${this.url}/Users/${serviceUserId}/Password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Token": this.apiKey,
      },
      body: JSON.stringify({ NewPw: password }),
    });

    if (!passwordResponse.ok) {
      const errorText = await passwordResponse.text();
      console.error(`Failed to set password for serviceUserId ${serviceUserId}: Status ${passwordResponse.status} - ${errorText}`);
      throw new Error(`Failed to set password: Status ${passwordResponse.status} - ${errorText}`);
    }
    console.log(`Password set successfully for serviceUserId: ${serviceUserId}`);

    console.log(`Applying user policy for serviceUserId: ${serviceUserId}`);
    const policyResponse = await fetch(`${this.url}/Users/${serviceUserId}/Policy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Token": this.apiKey,
      },
      body: JSON.stringify(this.getUserPolicy(true, 2)),
    });

    if (!policyResponse.ok) {
      const errorText = await policyResponse.text();
      console.error(`Failed to apply user policy for serviceUserId ${serviceUserId}: Status ${policyResponse.status} - ${errorText}`);
      throw new Error(`Failed to apply user policy: Status ${policyResponse.status} - ${errorText}`);
    }
    console.log(`User policy applied successfully for serviceUserId: ${serviceUserId}`);

    return serviceUserId;
  }

  async enableUser(userId: string): Promise<void> {
    const updateResponse = await fetch(`${this.url}/Users/${userId}/Policy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Token": this.apiKey,
      },
      body: JSON.stringify(this.getUserPolicy(false, 2)),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to enable Emby user: Status ${updateResponse.status} - ${errorText}`);
    }
  }

  async disableUser(userId: string): Promise<void> {
    const policyResponse = await fetch(`${this.url}/Users/${userId}/Policy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Token": this.apiKey,
      },
      body: JSON.stringify({ IsDisabled: true }),
    });

    if (!policyResponse.ok) {
      throw new Error(`Failed to disable Emby user: Status ${policyResponse.status} - ${await policyResponse.text()}`);
    }
  }

  async updatePassword(normalizedUsername: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.url}/Users`, {
      headers: { "X-Emby-Token": this.apiKey },
    });
    const users = await response.json();
    const user = users.find((user: any) => user.Name.toLowerCase() === normalizedUsername.toLowerCase());
    if (!user) throw new Error("Emby user not found");

    const passwordResponse = await fetch(`${this.url}/Users/${user.Id}/Password`, {
      method: "POST",
      headers: {
        "X-Emby-Token": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        NewPw: newPassword,
      }),
    });

    if (!passwordResponse.ok) throw new Error("Emby password update failed");
  }

  async verifyUserExists(serviceUserId: string): Promise<boolean> {
    console.log(`Verifying user with serviceUserId ${serviceUserId} exists in Emby...`);
    const response = await fetch(`${this.url}/Users/${serviceUserId}`, {
      headers: { "X-Emby-Token": this.apiKey },
    });
    if (!response.ok) {
      console.log(`User with serviceUserId ${serviceUserId} not found in Emby: Status ${response.status} - ${await response.text()}`);
      return false;
    }
    console.log(`User with serviceUserId ${serviceUserId} found in Emby`);
    return true;
  }

  async updateProfileImage(serviceUserId: string, imageUrl: string, contentType: string): Promise<void> {
    console.log(`Fetching image from URL: ${imageUrl}`);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from URL: Status ${imageResponse.status} - ${await imageResponse.text()}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageData = Buffer.from(imageBuffer);
    console.log(`Image data fetched successfully, size: ${imageData.length} bytes`);

    const base64Data = imageData.toString("base64");
    console.log(`Encoded image data as Base-64, length: ${base64Data.length} characters, preview: ${base64Data.slice(0, 50)}...`);

    const headers = {
      "X-Emby-Token": this.apiKey,
      "Content-Type": contentType,
      "Content-Transfer-Encoding": "base64",
    };

    console.log(`Request headers: ${JSON.stringify(headers)}`);

    console.log(`Uploading Base-64 encoded image to Emby for user ${serviceUserId} with Content-Type: ${headers["Content-Type"]}`);
    const response = await fetch(`${this.url}/Users/${serviceUserId}/Images/Primary`, {
      method: "POST",
      headers: headers,
      body: base64Data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to update Emby profile image: Status ${response.status} - ${errorText}`);
      throw new Error(`Failed to update Emby profile image: Status ${response.status} - ${errorText}`);
    }
    console.log(`Profile image uploaded successfully to Emby for user ${serviceUserId}`);
  }
}

// Account Service Manager
class AccountServiceManager {
  private services: { [key: string]: ServiceHandler };

  constructor() {
    this.services = {
      emby: new EmbyService(SERVICES.emby),
    };
  }

  async setupUserAccount(uid: string, email: string, username: string, password: string): Promise<void> {
    const userRef = admin.firestore().doc(`users/${uid}`);
    const normalizedUsername = username.trim().toLowerCase();
    let userData = {
      email,
      username,
      normalizedUsername,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      services: {} as { [key: string]: { linked: boolean; serviceUserId: string; subscriptionStatus: string } },
    };

    const usersSnapshot = await admin.firestore().collection("users").where("normalizedUsername", "==", normalizedUsername).get();
    if (!usersSnapshot.empty) {
      throw new HttpsError("already-exists", "Username is already taken in Firestore");
    }

    const embyAvailable = await checkEmbyUsernameLocally(normalizedUsername);
    if (!embyAvailable) {
      throw new HttpsError("already-exists", "Username is already taken in Emby");
    }

    const servicesToCreate = Object.keys(this.services).filter((serviceName) => !userData.services?.[serviceName]?.linked);
    for (const serviceName of servicesToCreate) {
      const serviceUserId = await this.services[serviceName].createUser(email, username, normalizedUsername, password);
      userData.services[serviceName] = {
        linked: true,
        serviceUserId: serviceUserId,
        subscriptionStatus: "inactive",
      };
    }

    await userRef.set(userData, { merge: true });
  }

  async syncPassword(username: string, newPassword: string): Promise<void> {
    const usersSnapshot = await admin.firestore().collection("users").where("username", "==", username).get();
    if (usersSnapshot.empty) {
      throw new HttpsError("not-found", "User not found in Firestore");
    }
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const normalizedUsername = userData.normalizedUsername;

    if (!normalizedUsername) {
      throw new HttpsError("not-found", "Normalized username not found for user");
    }

    const servicesToSync = Object.keys(this.services);
    for (const serviceName of servicesToSync) {
      try {
        await this.services[serviceName].updatePassword(normalizedUsername, newPassword);
        console.log(`Password synced for service: ${serviceName}`);
      } catch (error: unknown) {
        console.error(`Failed to sync password for service ${serviceName}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        throw new HttpsError("internal", `Failed to sync password for service ${serviceName}: ${errorMessage}`);
      }
    }
  }

  async syncProfileImage(normalizedUsername: string, imageUrl: string, contentType: string): Promise<void> {
    const usersSnapshot = await admin.firestore().collection("users").where("normalizedUsername", "==", normalizedUsername).get();
    if (usersSnapshot.empty) {
      throw new HttpsError("not-found", "User not found in Firestore");
    }
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();

    const servicesToSync = Object.keys(this.services);
    for (const serviceName of servicesToSync) {
      const userId = userData?.services?.[serviceName]?.serviceUserId;
      if (!userId) {
        console.log(`Skipping ${serviceName} - no user ID found`);
        continue;
      }

      try {
        const userExists = await this.services[serviceName].verifyUserExists(userId);
        if (!userExists) {
          console.log(`User with ID ${userId} not found in ${serviceName}, skipping`);
          continue;
        }
        await this.services[serviceName].updateProfileImage(userId, imageUrl, contentType);
        console.log(`Profile image synced for service: ${serviceName}`);
      } catch (error: unknown) {
        console.error(`Failed to sync profile image for service ${serviceName}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        throw new HttpsError("internal", `Failed to sync profile image for service ${serviceName}: ${errorMessage}`);
      }
    }
  }

  async enableUser(serviceName: string, userId: string): Promise<void> {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    await service.enableUser(userId);
  }
}

async function checkEmbyUsernameLocally(normalizedUsername: string): Promise<boolean> {
  try {
    if (!EMBY_API_KEY) {
      throw new HttpsError("internal", "EMBY_API_KEY is not configured in Firebase Functions");
    }

    const embyResponse = await fetch(`${EMBY_BASE_URL}/Users`, {
      method: "GET",
      headers: { "X-Emby-Token": EMBY_API_KEY },
    });

    if (!embyResponse.ok) {
      throw new HttpsError("internal", `Emby API Error: Status ${embyResponse.status} - ${await embyResponse.statusText}`);
    }

    const userList = await embyResponse.json();
    const userExists = userList.some((user: { Name: string }) => user.Name.toLowerCase() === normalizedUsername.toLowerCase());
    return !userExists;
  } catch (error: unknown) {
    console.error("Error checking Emby username locally:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Internal server error: ${errorMessage}`);
  }
}

const isValidMagicBytes = (buffer: Buffer, mimeType: string): boolean => {
  const expectedBytes = VALID_MAGIC_BYTES[mimeType];
  if (!expectedBytes) {
    console.log(`No magic bytes defined for MIME type: ${mimeType}`);
    return false;
  }
  const isValid = expectedBytes.every((byte, index) => buffer[index] === byte);
  console.log(`Magic bytes check for ${mimeType}:`, {
    expected: expectedBytes,
    actual: buffer.slice(0, expectedBytes.length),
    isValid,
  });
  return isValid;
};

const accountServiceManager = new AccountServiceManager();

exports.setupUserAccount = onCall<SetupUserAccountData>(async (request) => {
  const { email, username, password } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const uid = auth.uid;

  if (!email || !username || !password) {
    throw new HttpsError("invalid-argument", "Email, username, and password are required");
  }

  try {
    await accountServiceManager.setupUserAccount(uid, email, username, password);
    return { success: true, message: "User account set up successfully" };
  } catch (error: unknown) {
    console.error("Error setting up user account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Internal server error: ${errorMessage}`);
  }
});


exports.checkUsername = onCall<CheckUsernameData>(async (request) => {
  const { username } = request.data;

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    throw new HttpsError("invalid-argument", "Username must be a string with at least 3 characters");
  }

  const normalizedUsername = username.trim().toLowerCase();
  const usersSnapshot = await admin.firestore().collection("users").where("normalizedUsername", "==", normalizedUsername).get();

  if (!usersSnapshot.empty) {
    return { available: false };
  }

  return { available: true };
});

exports.uploadProfileImage = onCall<UploadProfileImageData>(
  async (request) => {
    const { fileName, contentType, file } = request.data;
    const auth = request.auth;

    console.log("Received request data:", {
      fileName,
      contentType,
      filePreview: file.slice(0, 50) + "...",
    });

    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }
    const uid = auth.uid;

    if (!file || typeof file !== "string") {
      console.log("Validation failed: file is missing or not a string");
      throw new HttpsError("invalid-argument", "File data (base64) is required and must be a string");
    }
    if (!fileName || typeof fileName !== "string" || fileName.trim().length === 0) {
      console.log("Validation failed: fileName is missing or empty");
      throw new HttpsError("invalid-argument", "File name is required and must be a non-empty string");
    }
    if (!contentType || typeof contentType !== "string") {
      console.log("Validation failed: contentType is missing or not a string");
      throw new HttpsError("invalid-argument", "Content type is required and must be a string");
    }

    const normalizedContentType = contentType.toLowerCase();
    console.log(`Content type: raw=${contentType}, normalized=${normalizedContentType}`);
    if (!VALID_MAGIC_BYTES.hasOwnProperty(normalizedContentType)) {
      console.log(`Unsupported content type: ${normalizedContentType}`);
      throw new HttpsError(
        "invalid-argument",
        `Invalid or unsupported content type: ${normalizedContentType} (expected: image/png, image/jpeg, image/jpg, image/bmp)`
      );
    }

    const fileBuffer = Buffer.from(file, "base64");
    console.log("Decoded buffer length:", fileBuffer.length);
    if (fileBuffer.length === 0) {
      console.log("Validation failed: buffer is empty");
      throw new HttpsError("invalid-argument", "Empty or invalid base64 data");
    }
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(file.replace(/\s/g, ""));
    console.log("Base64 format valid:", isBase64);
    if (!isBase64) {
      throw new HttpsError("invalid-argument", "Invalid base64 encoding");
    }
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (fileBuffer.length > MAX_FILE_SIZE) {
      console.log(`Validation failed: file size ${fileBuffer.length} exceeds ${MAX_FILE_SIZE}`);
      throw new HttpsError("invalid-argument", "File size exceeds 5MB limit");
    }
    if (!isValidMagicBytes(fileBuffer, normalizedContentType)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid or corrupted image file for type ${normalizedContentType}`
      );
    }

    console.log(`File validated: ${fileName}, type: ${normalizedContentType}, size: ${fileBuffer.length} bytes`);

    const tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, fileBuffer);
    console.log("Temp file written:", tempFilePath);

    try {
      const storagePath = `profile-images/${uid}/${fileName}`;
      const file = BUCKET.file(storagePath);

      const userDoc = await admin.firestore().doc(`users/${uid}`).get();
      const currentData = userDoc.data();
      const currentProfileImage = currentData?.profileImage;

      if (currentProfileImage) {
        const urlParts = new URL(currentProfileImage);
        const pathParts = urlParts.pathname.split('/');
        const oldFileName = pathParts[pathParts.length - 1].split('?')[0];
        const oldStoragePath = `profile-images/${uid}/${oldFileName}`;

        try {
          await BUCKET.file(oldStoragePath).delete();
          console.log("Old profile image deleted from storage:", oldStoragePath);
        } catch (deleteError: any) {
          if (deleteError.code !== 404) {
            console.warn("Failed to delete old profile image, may not exist:", deleteError);
          }
        }
      }

      await BUCKET.upload(tempFilePath, {
        destination: storagePath,
        metadata: { contentType: normalizedContentType },
        public: false,
      });
      console.log("New profile image uploaded to storage (overwritten):", storagePath);

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 315360000000,
      });
      console.log("Signed URL generated:", url);

      await admin.firestore().doc(`users/${uid}`).set({ profileImage: url }, { merge: true });
      console.log("Firestore updated with URL for user:", uid);

      const updatedUserDoc = await admin.firestore().doc(`users/${uid}`).get();
      const updatedUserData = updatedUserDoc.data();
      const normalizedUsername = updatedUserData?.normalizedUsername;
      if (!normalizedUsername) {
        throw new HttpsError("not-found", "Normalized username not found for user");
      }

      await accountServiceManager.syncProfileImage(normalizedUsername, url, normalizedContentType);
      console.log("Profile image synced with Emby");

      return {
        success: true,
        message: "Profile image uploaded and synced successfully",
        url,
        storagePath,
      };
    } catch (error: unknown) {
      console.error("Error uploading profile image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Internal server error: ${errorMessage}`);
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temp file cleaned up:", tempFilePath);
        }
      } catch (unlinkError) {
        console.warn("Failed to clean up temp file:", unlinkError);
      }
    }
  }
);

exports.syncEmbyPassword = onCall(async (request) => {
  const { username, newPassword } = request.data;
  if (!username || !newPassword) throw new HttpsError("invalid-argument", "Username and new password are required");

  try {
    const accountServiceManager = new AccountServiceManager();
    await accountServiceManager.syncPassword(username, newPassword);
    return { success: true, message: "Emby password updated successfully" };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to sync Emby password: ${errorMessage}`);
  }
});

exports.activateEmbyAccount = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const uid = auth.uid;

  try {
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found in Firestore");
    }
    const userData = userDoc.data();

    const userId = userData?.services?.emby?.serviceUserId;
    if (!userId) {
      throw new HttpsError("not-found", "Emby user ID not found for this user");
    }

    const currentStatus = userData?.services?.emby?.subscriptionStatus;
    if (currentStatus === "active") {
      return { success: true, message: "Emby account is already active" };
    }

    await accountServiceManager.enableUser("emby", userId);
    await admin.firestore().doc(`users/${uid}`).update({
      "services.emby.subscriptionStatus": "active",
    });

    return { success: true, message: "Emby account activated successfully" };
  } catch (error: unknown) {
    console.error("Error activating Emby account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to activate Emby account: ${errorMessage}`);
  }
});

exports.createPaypalOrder = onCall<CreatePaypalOrderData, Promise<CreatePaypalOrderResponse>>(
  async (request) => {
    const { userId, sessionId, tokens, amount, currency } = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to create a PayPal order.");
    }

    if (auth.uid !== userId) {
      throw new HttpsError("permission-denied", "User ID does not match authenticated user.");
    }

    if (!userId || !sessionId || !tokens || !amount || !currency) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: userId, sessionId, tokens, amount, currency."
      );
    }

    if (typeof tokens !== "number" || tokens <= 0) {
      throw new HttpsError("invalid-argument", "Tokens must be a positive number.");
    }
    if (typeof amount !== "string" || !amount.match(/^\d+(\.\d{1,2})?$/)) {
      throw new HttpsError("invalid-argument", "Amount must be a valid monetary value (e.g., '5.00').");
    }
    if (currency !== "USD") {
      throw new HttpsError("invalid-argument", "Currency must be 'USD'.");
    }

    const validTokenPackages = [60, 120, 600, 1200];
    if (!validTokenPackages.includes(tokens)) {
      throw new HttpsError("invalid-argument", "Invalid token package.");
    }

    try {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const secret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_API_BASE;

      if (!clientId || !secret || !paypalApiBase) {
        throw new HttpsError("internal", "PayPal credentials are not configured in environment variables.");
      }

      const authResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      });

      if (!authResponse.ok) {
        throw new HttpsError("internal", `Failed to obtain PayPal access token: ${authResponse.statusText}`);
      }

      const authData = await authResponse.json();
      const accessToken = authData.access_token;
      if (!accessToken) {
        throw new HttpsError("internal", "Failed to obtain PayPal access token: No access token in response.");
      }

      const customId = `${userId}:${sessionId}`;
      const createOrderResponse = await fetch(`${paypalApiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                value: amount,
                currency_code: currency,
              },
              description: `Purchase of ${tokens} tokens for Gondola Bros`,
              custom_id: customId,
            },
          ],
        }),
      });

      if (!createOrderResponse.ok) {
        throw new HttpsError("internal", `Failed to create PayPal order: ${createOrderResponse.statusText}`);
      }

      const orderData = await createOrderResponse.json();
      const orderId = orderData.id;
      if (!orderId) {
        throw new HttpsError("internal", "Failed to create PayPal order: No order ID in response.");
      }

      return { orderId };
    } catch (error: unknown) {
      console.error("Error in createPaypalOrder:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Failed to create PayPal order: ${errorMessage}`);
    }
  }
);

exports.processTokenPurchase = onCall<ProcessTokenPurchaseData, Promise<ProcessTokenPurchaseResponse>>(
  async (request) => {
    const { userId, orderId, sessionId, tokens, amount, currency } = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to process a token purchase.");
    }

    if (auth.uid !== userId) {
      throw new HttpsError("permission-denied", "User ID does not match authenticated user.");
    }

    if (!userId || !orderId || !sessionId || !tokens || !amount || !currency) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: userId, orderId, sessionId, tokens, amount, currency."
      );
    }

    if (typeof tokens !== "number" || tokens <= 0) {
      throw new HttpsError("invalid-argument", "Tokens must be a positive number.");
    }
    if (typeof amount !== "string" || !amount.match(/^\d+(\.\d{1,2})?$/)) {
      throw new HttpsError("invalid-argument", "Amount must be a valid monetary value (e.g., '5.00').");
    }
    if (currency !== "USD") {
      throw new HttpsError("invalid-argument", "Currency must be 'USD'.");
    }

    const validTokenPackages = [60, 120, 600, 1200];
    if (!validTokenPackages.includes(tokens)) {
      throw new HttpsError("invalid-argument", "Invalid token package.");
    }

    try {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const secret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_API_BASE;

      if (!clientId || !secret || !paypalApiBase) {
        throw new HttpsError("internal", "PayPal credentials are not configured in environment variables.");
      }

      const authResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      });

      if (!authResponse.ok) {
        throw new HttpsError("internal", `Failed to obtain PayPal access token: ${authResponse.statusText}`);
      }

      const authData = await authResponse.json();
      const accessToken = authData.access_token;
      if (!accessToken) {
        throw new HttpsError("internal", "Failed to obtain PayPal access token: No access token in response.");
      }

      const orderDetailsResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${orderId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!orderDetailsResponse.ok) {
        throw new HttpsError("failed-precondition", `Failed to fetch order details: ${orderDetailsResponse.statusText}`);
      }

      const orderDetails = await orderDetailsResponse.json();
      const customId = orderDetails.purchase_units?.[0]?.custom_id;
      const expectedCustomId = `${userId}:${sessionId}`;
      if (customId !== expectedCustomId) {
        throw new HttpsError("permission-denied", "Order does not belong to the authenticated user or session.");
      }

      const orderAmount = orderDetails.purchase_units?.[0]?.amount?.value;
      const orderCurrency = orderDetails.purchase_units?.[0]?.amount?.currency_code;
      if (orderAmount !== amount || orderCurrency !== currency) {
        throw new HttpsError("invalid-argument", "Order amount or currency does not match request data.");
      }

      const captureResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!captureResponse.ok) {
        throw new HttpsError("failed-precondition", `Payment capture failed: ${captureResponse.statusText}`);
      }

      const captureData = await captureResponse.json();
      if (captureData.status !== "COMPLETED") {
        throw new HttpsError("failed-precondition", `Payment capture failed: ${captureData.status}`);
      }

      const result = await admin.firestore().runTransaction(async (transaction) => {
        const existingTransactionQuery = admin
          .firestore()
          .collection("tokenPurchases")
          .where("orderId", "==", orderId);
        const existingTransactionSnapshot = await transaction.get(existingTransactionQuery);
        if (!existingTransactionSnapshot.empty) {
          throw new HttpsError("already-exists", "This PayPal order has already been processed.");
        }

        const userRef = admin.firestore().doc(`users/${userId}`);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new HttpsError("not-found", "User not found in Firestore.");
        }

        transaction.update(userRef, {
          tokenBalance: admin.firestore.FieldValue.increment(tokens),
        });
        console.log(`Updated token balance for user ${userId}: +${tokens} tokens`);

        const tokenPurchaseRef = admin.firestore().collection("tokenPurchases").doc();
        transaction.set(tokenPurchaseRef, {
          userId,
          orderId,
          tokens,
          amount,
          currency,
          status: "completed",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Logged token purchase for user ${userId}: orderId=${orderId}, tokens=${tokens}`);

        return { success: true, orderId };
      });

      return result;
    } catch (error: unknown) {
      console.error("Error in processTokenPurchase:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Failed to process token purchase: ${errorMessage}`);
    }
  }
);

exports.processTokenTrade = onCall<ProcessTokenTradeData, Promise<ProcessTokenTradeResponse>>(
  async (request) => {
    const { senderId, receiverUsername, tokens } = request.data;
    const auth = request.auth;

    // Validate authentication
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to process a token trade.");
    }

    // Verify that the authenticated user matches the senderId
    if (auth.uid !== senderId) {
      throw new HttpsError("permission-denied", "Sender ID does not match authenticated user.");
    }

    // Validate input data
    if (!senderId || !receiverUsername || !tokens) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: senderId, receiverUsername, tokens."
      );
    }

    // Validate tokens
    if (typeof tokens !== "number" || tokens <= 0) {
      throw new HttpsError("invalid-argument", "Tokens must be a positive number.");
    }

    // Validate receiverUsername
    if (typeof receiverUsername !== "string" || receiverUsername.trim().length < 3) {
      throw new HttpsError("invalid-argument", "Receiver username must be a valid string with at least 3 characters.");
    }

    try {
      // Look up the receiver's UID using the normalizedUsername
      const normalizedUsername: string = receiverUsername.trim().toLowerCase();
      const usersRef = admin.firestore().collection("users");
      const userQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = usersRef.where("normalizedUsername", "==", normalizedUsername);
      const userSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData> = await userQuery.get();

      if (userSnap.empty) {
        throw new HttpsError("not-found", "Recipient username not found.");
      }

      // There should be exactly one user with this normalizedUsername (since it's unique)
      const receiverDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> = userSnap.docs[0];
      const receiverId: string = receiverDoc.id;
      const receiverData: UserDocumentData = receiverDoc.data() as UserDocumentData;
      const receiverUsernameOriginal: string = receiverData.username; // Fetch the original username

      // Run the trade operations in a transaction to ensure atomicity
      const result = await admin.firestore().runTransaction(async (transaction) => {
        // Get sender's user document
        const senderRef = admin.firestore().doc(`users/${senderId}`);
        const senderDoc = await transaction.get(senderRef);
        if (!senderDoc.exists) {
          throw new HttpsError("not-found", "Sender user not found in Firestore.");
        }
        const senderData: UserDocumentData = senderDoc.data() as UserDocumentData;
        const senderBalance: number = senderData.tokenBalance || 0;
        const senderUsername: string = senderData.username; // Fetch the sender's username

        // Validate sender's balance
        if (senderBalance < tokens) {
          throw new HttpsError("failed-precondition", "Sender has insufficient tokens for the trade.");
        }

        // Get receiver's user document
        const receiverRef = admin.firestore().doc(`users/${receiverId}`);
        const receiverDocTrans = await transaction.get(receiverRef);
        if (!receiverDocTrans.exists) {
          throw new HttpsError("not-found", "Receiver user not found in Firestore.");
        }
        const receiverDataTrans: UserDocumentData = receiverDocTrans.data() as UserDocumentData;
        const receiverBalance: number = receiverDataTrans.tokenBalance || 0;

        // Compute updates based on whether sender and receiver are the same
        if (senderId === receiverId) {
          // If sender and receiver are the same, the net change to the token balance should be zero
          // We still log the trade for auditing purposes, but the balance doesn't change
          transaction.update(senderRef, {
            tokenBalance: senderBalance, // No change (deduct and add cancel out)
          });
        } else {
          // Normal case: deduct from sender, add to receiver
          transaction.update(senderRef, {
            tokenBalance: senderBalance - tokens,
          });
          transaction.update(receiverRef, {
            tokenBalance: receiverBalance + tokens,
          });
        }

        // Log the trade in the trades collection
        const tradeRef = admin.firestore().collection("trades").doc();
        transaction.set(tradeRef, {
          senderId,
          senderUsername,
          receiverId,
          receiverUsername: receiverUsernameOriginal,
          tokens,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { success: true };
      });

      return result;
    } catch (error: unknown) {
      console.error("Error in processTokenTrade:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Failed to process token trade: ${errorMessage}`);
    }
  }
);

exports.createTipOrder = onCall<CreateTipOrderData, Promise<CreateTipOrderResponse>>(async (request) => {
  const { userId, sessionId, amount, currency } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  if (auth.uid !== userId) throw new HttpsError("permission-denied", "User ID does not match authenticated user.");
  if (!userId || !sessionId || !amount || !currency) {
    throw new HttpsError("invalid-argument", "Missing required fields: userId, sessionId, amount, currency.");
  }
  if (typeof amount !== "string" || !amount.match(/^\d+(\.\d{1,2})?$/)) {
    throw new HttpsError("invalid-argument", "Amount must be a valid monetary value (e.g., '5.00').");
  }
  if (currency !== "USD") throw new HttpsError("invalid-argument", "Currency must be 'USD'.");
  if (parseFloat(amount) < 1.0) throw new HttpsError("invalid-argument", "Minimum tip amount is $1.00.");

  try {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    const paypalApiBase = process.env.PAYPAL_API_BASE;

    if (!clientId || !secret || !paypalApiBase) {
      throw new HttpsError("internal", "PayPal credentials are not configured.");
    }

    const authResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!authResponse.ok) throw new HttpsError("internal", `Failed to obtain PayPal access token: ${authResponse.statusText}`);
    const authData = await authResponse.json();
    const accessToken = authData.access_token;
    if (!accessToken) throw new HttpsError("internal", "No access token in response.");

    const customId = `${userId}:${sessionId}`;
    const createOrderResponse = await fetch(`${paypalApiBase}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { value: amount, currency_code: currency },
            description: "Donation for Gondola Bros",
            custom_id: customId,
          },
        ],
      }),
    });

    if (!createOrderResponse.ok) throw new HttpsError("internal", `Failed to create PayPal order: ${createOrderResponse.statusText}`);
    const orderData = await createOrderResponse.json();
    const orderId = orderData.id;
    if (!orderId) throw new HttpsError("internal", "No order ID in response.");

    return { orderId };
  } catch (error: unknown) {
    console.error("Error in createTipOrder:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to create tip order: ${errorMessage}`);
  }
});

exports.processTip = onCall<ProcessTipData, Promise<ProcessTipResponse>>(async (request) => {
  const { userId, orderId, sessionId, amount, currency } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  if (auth.uid !== userId) throw new HttpsError("permission-denied", "User ID does not match authenticated user.");
  if (!userId || !orderId || !sessionId || !amount || !currency) {
    throw new HttpsError("invalid-argument", "Missing required fields: userId, orderId, sessionId, amount, currency.");
  }
  if (typeof amount !== "string" || !amount.match(/^\d+(\.\d{1,2})?$/)) {
    throw new HttpsError("invalid-argument", "Amount must be a valid monetary value (e.g., '5.00').");
  }
  if (currency !== "USD") throw new HttpsError("invalid-argument", "Currency must be 'USD'.");
  if (parseFloat(amount) < 1.0) throw new HttpsError("invalid-argument", "Minimum tip amount is $1.00.");

  try {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    const paypalApiBase = process.env.PAYPAL_API_BASE;

    if (!clientId || !secret || !paypalApiBase) {
      throw new HttpsError("internal", "PayPal credentials are not configured.");
    }

    const authResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!authResponse.ok) throw new HttpsError("internal", `Failed to obtain PayPal access token: ${authResponse.statusText}`);
    const authData = await authResponse.json();
    const accessToken = authData.access_token;
    if (!accessToken) throw new HttpsError("internal", "No access token in response.");

    // Fetch order details for validation
    const orderDetailsResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!orderDetailsResponse.ok) throw new HttpsError("failed-precondition", `Failed to fetch order details: ${orderDetailsResponse.statusText}`);
    const orderDetails = await orderDetailsResponse.json();
    const customId = orderDetails.purchase_units?.[0]?.custom_id;
    const expectedCustomId = `${userId}:${sessionId}`;
    if (customId !== expectedCustomId) throw new HttpsError("permission-denied", "Order does not belong to the user or session.");

    // Validate amount and currency before any capture
    const orderAmount = orderDetails.purchase_units?.[0]?.amount?.value;
    const orderCurrency = orderDetails.purchase_units?.[0]?.amount?.currency_code;
    console.log("[processTip] Order data:", { orderAmount, orderCurrency, receivedAmount: amount, receivedCurrency: currency });

    const normalizedOrderAmount = parseFloat(orderAmount).toFixed(2);
    const normalizedReceivedAmount = parseFloat(amount).toFixed(2);
    if (normalizedOrderAmount !== normalizedReceivedAmount || orderCurrency !== currency) {
      console.error("[processTip] Amount mismatch detected:", {
        normalizedOrderAmount,
        normalizedReceivedAmount,
        orderCurrency,
        currency,
      });
      throw new HttpsError("invalid-argument", "Order amount or currency does not match request data. Transaction aborted.");
    }

    // Check for existing tip in Firestore before capturing payment
    const existingTipQuery = admin.firestore().collection("tips").where("orderId", "==", orderId);
    const existingTipSnapshot = await existingTipQuery.get();
    if (!existingTipSnapshot.empty) throw new HttpsError("already-exists", "This tip order has already been processed.");

    // Validate user exists in Firestore before capturing payment
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found in Firestore.");

    // Now that all validations passed, capture the payment
    const captureResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!captureResponse.ok) throw new HttpsError("failed-precondition", `Payment capture failed: ${captureResponse.statusText}`);
    const captureData = await captureResponse.json();
    if (captureData.status !== "COMPLETED") throw new HttpsError("failed-precondition", `Payment capture failed: ${captureData.status}`);

    // After successful capture, proceed with Firestore transaction
    const result = await admin.firestore().runTransaction(async (transaction) => {
      const userData = userDoc.data();
      const username = userData?.username || "Anonymous";

      const tipRef = admin.firestore().collection("tips").doc();
      transaction.set(tipRef, {
        userId,
        username,
        amount: normalizedReceivedAmount,
        currency,
        orderId,
        status: "completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, orderId };
    });

    return result;
  } catch (error: unknown) {
    console.error("Error in processTip:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to process tip: ${errorMessage}`);
  }
});