import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getAllSecrets } from './secrets';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "gondola-bros-hub.firebasestorage.app",
  });
}

// Initialize secrets
let secretsConfig: {
  EMBY_API_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PAYPAL_API_BASE: string;
  PAYPAL_CLIENT_ID_SANDBOX: string;
  PAYPAL_SECRET_SANDBOX: string;
  PAYPAL_API_BASE_SANDBOX: string;
  JELLYSEERR_API_KEY: string;
} | null = null;

async function getSecretsConfig() {
  if (!secretsConfig) {
    secretsConfig = await getAllSecrets();
  }
  return secretsConfig;
}



// Determine if we're in sandbox mode (you can set this via environment variable)
const IS_PAYPAL_SANDBOX = process.env.PAYPAL_SANDBOX === 'true';

const EMBY_BASE_URL: string = "https://media.gondolabros.com";
const JELLYSEERR_URL = "https://request-media.gondolabros.com"
const BUCKET = admin.storage().bucket();

const SUBSCRIPTION_PLANS: { [key: string]: SubscriptionPlan } = {
  standard: { monthly: 60, yearly: 600 },
  duo: { monthly: 80, yearly: 800 },
  family: { monthly: 120, yearly: 1200 },
  ultimate: { monthly: 250, yearly: 2500 },
};

const VALID_MAGIC_BYTES: { [key: string]: number[] } = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/jpg": [0xff, 0xd8, 0xff],
  "image/bmp": [0x42, 0x4d],
};


// Interface definitions
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

interface ProcessSubscriptionData {
  userId: string;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  duration: number;
  isUpgrade?: boolean;      // Add this
  proRateCredit?: number;   // Add this
}

interface ProcessSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  endDate: string;
}

interface SubscriptionPlan {
  monthly: number;
  yearly: number;
}

interface CheckSubscriptionStatusData {
  userId: string;
}

interface CheckSubscriptionStatusResponse {
  hasActiveSubscription: boolean;
  subscription?: {
    subscriptionId: string;
    planId: string;
    billingPeriod: string;
    startDate: string;
    endDate: string;
    status: string;
    autoRenew: boolean;
    daysRemaining: number;
  };
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

class EmbyService implements ServiceHandler {
  private apiKey: string = "";
  private url: string;
  private initialized: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      const secrets = await getSecretsConfig();
      this.apiKey = secrets.EMBY_API_KEY;
      this.initialized = true;
    }
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
      EnableSubtitleDownloading: true,  // Allow subtitle downloading
      EnableSubtitleManagement: false,  // But not deletion
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
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
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
      emby: new EmbyService(EMBY_BASE_URL),
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
    console.log(`Syncing new user ${username} to Jellyseerr`);
    await syncJellyseerrUser(userData.services[serviceName].serviceUserId);
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
    const secrets = await getSecretsConfig();
    
    const embyResponse = await fetch(`${EMBY_BASE_URL}/Users`, {
      method: "GET",
      headers: { "X-Emby-Token": secrets.EMBY_API_KEY },
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

// Helper function to disable Emby account
async function disableEmbyAccount(embyUserId: string): Promise<void> {
  const secrets = await getSecretsConfig();
  
  const response = await fetch(`${EMBY_BASE_URL}/Users/${embyUserId}/Policy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Token": secrets.EMBY_API_KEY,
    },
    body: JSON.stringify({ IsDisabled: true }),
  });

  if (!response.ok) {
    throw new Error(`Failed to disable Emby account: ${response.status}`);
  }
}

async function updateEmbySubscriptionPermissions(embyUserId: string, planId: string): Promise<void> {
  const secrets = await getSecretsConfig();
  
  // Base template - everything disabled by default
  const basePolicy = {
    IsAdministrator: false,
    EnableRemoteAccess: true,
    EnableMediaPlayback: true,
    EnableAudioPlaybackTranscoding: true,
    EnableVideoPlaybackTranscoding: true,
    EnablePlaybackRemuxing: true,
    EnableLiveTvAccess: false,
    EnableLiveTvManagement: false,
    RemoteClientBitrateLimit: 0,
    EnableContentDeletion: false,
    RestrictedFeatures: ["notifications"],
    EnableRemoteControlOfOtherUsers: false,
    EnableSharedDeviceControl: false,
    EnableSyncTranscoding: false,
    EnableSubtitleDownloading: true,  // Allow subtitle downloading
    EnableSubtitleManagement: false,   // But not deletion
    AllowCameraUpload: false,
    EnableMediaConversion: false,
    EnablePublicSharing: false,
    EnableSocialSharing: false,
    EnableUserPreferenceAccess: false,
    IsDisabled: false,  // Make sure account is active
    IsHidden: true,
    IsHiddenRemotely: false,
    IsHiddenFromUnusedDevices: true,
    EnableAllFolders: true,
    EnableAllChannels: true,
  };

  // Plan-specific permissions (only what changes from base)
  const planPermissions: { [key: string]: any } = {
    standard: { 
      SimultaneousStreamLimit: 1, 
      EnableContentDownloading: true 
    },
    duo: { 
      SimultaneousStreamLimit: 2, 
      EnableContentDownloading: true 
    },
    family: { 
      SimultaneousStreamLimit: 4, 
      EnableContentDownloading: true 
    },
    ultimate: { 
      SimultaneousStreamLimit: 10,  // Changed from 0 to 10 as per your comment
      EnableContentDownloading: true 
    },
  };

  const permissions = planPermissions[planId];
  if (!permissions) {
    throw new Error(`Unknown plan ID: ${planId}`);
  }

  // Merge base policy with plan-specific permissions
  const updatedPolicy = {
    ...basePolicy,
    ...permissions
  };

  // Update user policy
  const updateResponse = await fetch(`${EMBY_BASE_URL}/Users/${embyUserId}/Policy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Token": secrets.EMBY_API_KEY,
    },
    body: JSON.stringify(updatedPolicy),
  });

  if (!updateResponse.ok) {
    throw new Error(`Failed to update Emby user policy: ${updateResponse.status}`);
  }
  
  console.log(`Successfully updated Emby permissions for user ${embyUserId} with plan ${planId}`);
}


async function updateJellyseerrRequestLimits(
  email: string, 
  planId: string, 
  embyUserId?: string,
  customLimits?: { movieLimit: number; tvLimit: number }
): Promise<void> {
  const secrets = await getSecretsConfig();
  const JELLYSEERR_API_KEY = secrets.JELLYSEERR_API_KEY;
  
  let limits: { movieLimit: number; tvLimit: number };
  
  if (customLimits) {
    limits = customLimits;
  } else {
    const planLimits: { [key: string]: { movieLimit: number; tvLimit: number } } = {
      standard: { movieLimit: 1, tvLimit: 1 },
      duo: { movieLimit: 2, tvLimit: 1 },
      family: { movieLimit: 4, tvLimit: 2 },
      ultimate: { movieLimit: 10, tvLimit: 5 },
    };

    limits = planLimits[planId];
    if (!limits) {
      console.log(`Unknown plan ${planId}, skipping Jellyseerr update`);
      return;
    }
  }

  if (!embyUserId) {
    console.log(`No Emby user ID provided for Jellyseerr update, skipping...`);
    return;
  }

  try {
    console.log(`Updating Jellyseerr limits for Emby user ID: ${embyUserId}, plan: ${planId}`);
    
    // Get all users from Jellyseerr
    const usersResponse = await fetch(`${JELLYSEERR_URL}/api/v1/user?take=1000`, {
      method: 'GET',
      headers: {
        "X-Api-Key": JELLYSEERR_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!usersResponse.ok) {
      console.error(`Failed to fetch Jellyseerr users: ${usersResponse.status}`);
      return;
    }

    const responseData = await usersResponse.json();
    const users = responseData.results || responseData;
    
    const jellyseerrUser = users.find((user: any) => 
      user.jellyfinUserId === embyUserId
    );

    if (!jellyseerrUser) {
      console.log(`User with Emby ID ${embyUserId} not found in Jellyseerr. They need to login first.`);
      return;
    }

    // Get user's full details to preserve all fields
    const userDetailsResponse = await fetch(`${JELLYSEERR_URL}/api/v1/user/${jellyseerrUser.id}`, {
      method: 'GET',
      headers: {
        "X-Api-Key": JELLYSEERR_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!userDetailsResponse.ok) {
      console.error(`Failed to get user details: ${userDetailsResponse.status}`);
      return;
    }

    const userDetails = await userDetailsResponse.json();

    // MUST send FULL object (Fallenbagel's requirement)
    const updatePayload = {
      username: userDetails.username || null,
      email: userDetails.email || userDetails.jellyfinUsername || email,
      discordId: userDetails.settings?.discordId || "",
      locale: userDetails.settings?.locale || "",
      discoverRegion: userDetails.settings?.discoverRegion || "",
      streamingRegion: userDetails.settings?.streamingRegion || "",
      originalLanguage: userDetails.settings?.originalLanguage || null,
      movieQuotaLimit: limits.movieLimit,
      movieQuotaDays: limits.movieLimit > 0 ? 30 : 0,
      tvQuotaLimit: limits.tvLimit,
      tvQuotaDays: limits.tvLimit > 0 ? 30 : 0,
      watchlistSyncMovies: userDetails.settings?.watchlistSyncMovies || null,
      watchlistSyncTv: userDetails.settings?.watchlistSyncTv || null,
    };

    console.log(`Updating Jellyseerr with FULL payload`);

    // CORRECT ENDPOINT: POST to /settings/main
    const updateResponse = await fetch(`${JELLYSEERR_URL}/api/v1/user/${jellyseerrUser.id}/settings/main`, {
      method: "POST",  // NOT PUT!
      headers: {
        "X-Api-Key": JELLYSEERR_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(updatePayload),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`Failed to update Jellyseerr: ${updateResponse.status} - ${errorText}`);
      return;
    }

    console.log(`Successfully updated Jellyseerr limits for user ${jellyseerrUser.id}`);
    
  } catch (error) {
    console.error("Error updating Jellyseerr limits:", error);
  }
}

async function syncJellyseerrUser(embyUserId: string): Promise<boolean> {
  const secrets = await getSecretsConfig();
  
  try {
    const response = await fetch(`${JELLYSEERR_URL}/api/v1/user/import-from-jellyfin`, {
      method: 'POST',
      headers: {
        'X-Api-Key': secrets.JELLYSEERR_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jellyfinUserIds: [embyUserId]
      })
    });
    
    if (!response.ok) {
      console.error(`Jellyseerr sync failed: ${response.status}`);
      return false;
    }
    
    console.log(`Jellyseerr user ${embyUserId} sync completed`);
    return true;
  } catch (error) {
    console.error('Error syncing Jellyseerr:', error);
    return false;
  }
}

const accountServiceManager = new AccountServiceManager();

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

    const validTokenPackages = [50, 100, 300, 600, 1200, 2500];
    if (!validTokenPackages.includes(tokens)) {
      throw new HttpsError("invalid-argument", "Invalid token package.");
    }

    try {
      // Get secrets from Secret Manager
      const secrets = await getSecretsConfig();
      
      // Use sandbox or production credentials based on environment
      const clientId = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_CLIENT_ID_SANDBOX : secrets.PAYPAL_CLIENT_ID;
      const secret = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_SECRET_SANDBOX : secrets.PAYPAL_SECRET;
      const paypalApiBase = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_API_BASE_SANDBOX : secrets.PAYPAL_API_BASE;

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

    const validTokenPackages = [50, 100, 300, 600, 1200, 2500];
    if (!validTokenPackages.includes(tokens)) {
      throw new HttpsError("invalid-argument", "Invalid token package.");
    }

    try {
      // Get secrets from Secret Manager
      const secrets = await getSecretsConfig();
      
      // Use sandbox or production credentials based on environment
      const clientId = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_CLIENT_ID_SANDBOX : secrets.PAYPAL_CLIENT_ID;
      const secret = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_SECRET_SANDBOX : secrets.PAYPAL_SECRET;
      const paypalApiBase = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_API_BASE_SANDBOX : secrets.PAYPAL_API_BASE;

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
    // Get secrets from Secret Manager
    const secrets = await getSecretsConfig();
    
    // Use sandbox or production credentials based on environment
    const clientId = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_CLIENT_ID_SANDBOX : secrets.PAYPAL_CLIENT_ID;
    const secret = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_SECRET_SANDBOX : secrets.PAYPAL_SECRET;
    const paypalApiBase = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_API_BASE_SANDBOX : secrets.PAYPAL_API_BASE;

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
    // Get secrets from Secret Manager
    const secrets = await getSecretsConfig();
    
    // Use sandbox or production credentials based on environment
    const clientId = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_CLIENT_ID_SANDBOX : secrets.PAYPAL_CLIENT_ID;
    const secret = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_SECRET_SANDBOX : secrets.PAYPAL_SECRET;
    const paypalApiBase = IS_PAYPAL_SANDBOX ? secrets.PAYPAL_API_BASE_SANDBOX : secrets.PAYPAL_API_BASE;

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

exports.processTokenTrade = onCall<ProcessTokenTradeData, Promise<ProcessTokenTradeResponse>>(
  async (request) => {
    const { senderId, receiverUsername, tokens } = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to trade tokens.");
    }

    if (auth.uid !== senderId) {
      throw new HttpsError("permission-denied", "Sender ID does not match authenticated user.");
    }

    if (!senderId || !receiverUsername || !tokens) {
      throw new HttpsError("invalid-argument", "Missing required fields: senderId, receiverUsername, tokens.");
    }

    if (typeof tokens !== "number" || tokens <= 0) {
      throw new HttpsError("invalid-argument", "Tokens must be a positive number.");
    }

    try {
      const receiverQuery = admin
        .firestore()
        .collection("users")
        .where("username", "==", receiverUsername)
        .limit(1);
      const receiverSnapshot = await receiverQuery.get();

      if (receiverSnapshot.empty) {
        throw new HttpsError("not-found", "Receiver username not found.");
      }

      const receiverDoc = receiverSnapshot.docs[0];
      const receiverId = receiverDoc.id;

      const result = await admin.firestore().runTransaction(async (transaction) => {
        const senderRef = admin.firestore().doc(`users/${senderId}`);
        const receiverRef = admin.firestore().doc(`users/${receiverId}`);

        const senderDoc = await transaction.get(senderRef);
        const receiverDoc = await transaction.get(receiverRef);

        if (!senderDoc.exists) {
          throw new HttpsError("not-found", "Sender not found in Firestore.");
        }
        if (!receiverDoc.exists) {
          throw new HttpsError("not-found", "Receiver not found in Firestore.");
        }

        const senderData = senderDoc.data() as UserDocumentData;
        const receiverData = receiverDoc.data() as UserDocumentData;

        const senderBalance = senderData.tokenBalance || 0;
        if (senderBalance < tokens) {
          throw new HttpsError("failed-precondition", "Insufficient tokens for trade.");
        }

        transaction.update(senderRef, {
          tokenBalance: admin.firestore.FieldValue.increment(-tokens),
        });
        transaction.update(receiverRef, {
          tokenBalance: admin.firestore.FieldValue.increment(tokens),
        });

        const tradeRef = admin.firestore().collection("trades").doc();
        transaction.set(tradeRef, {
          senderId,
          senderUsername: senderData.username,
          receiverId,
          receiverUsername: receiverData.username,
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

exports.processSubscription = onCall<ProcessSubscriptionData, Promise<ProcessSubscriptionResponse>>(
  async (request) => {
    const { userId, planId, billingPeriod, duration, proRateCredit } = request.data;
    const auth = request.auth;

    if (!auth || auth.uid !== userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    if (!userId || !planId || !billingPeriod || !duration) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!SUBSCRIPTION_PLANS[planId]) {
      throw new HttpsError("invalid-argument", "Invalid plan ID.");
    }

    if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
      throw new HttpsError("invalid-argument", "Billing period must be 'monthly' or 'yearly'.");
    }

    if (typeof duration !== "number" || duration <= 0) {
      throw new HttpsError("invalid-argument", "Duration must be a positive number.");
    }

    try {
      const plan = SUBSCRIPTION_PLANS[planId];
      const baseTokenCost = billingPeriod === "monthly" ? plan.monthly : plan.yearly;
      let totalTokenCost = baseTokenCost * duration;

      // Check if there's an active subscription BEFORE the transaction
      const activeSubQuery = admin
        .firestore()
        .collection("subscriptions")
        .where("userId", "==", userId)
        .where("status", "==", "active");
      const activeSubSnapshot = await activeSubQuery.get();
      const hasActiveSubscription = !activeSubSnapshot.empty;

      const result = await admin.firestore().runTransaction(async (transaction) => {
        const userRef = admin.firestore().doc(`users/${userId}`);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          throw new HttpsError("not-found", "User not found.");
        }

        const userData = userDoc.data();
        const currentBalance = userData?.tokenBalance || 0;

        let startDate = new Date();
        let endDate: Date;
        let isImmediateUpgrade = false;
        let isDowngrade = false;
        let subscriptionId = "";

        if (hasActiveSubscription) {
          const activeSub = activeSubSnapshot.docs[0].data();
          const currentPlanId = activeSub.planId;
          const activeEndDate = activeSub.endDate.toDate();
          
          // Check for scheduled downgrade spam
          if (activeSub.scheduledDowngrade && activeSub.scheduledDowngrade.planId === planId) {
            const currentPlanIndex = Object.keys(SUBSCRIPTION_PLANS).indexOf(currentPlanId);
            const newPlanIndex = Object.keys(SUBSCRIPTION_PLANS).indexOf(planId);
            
            if (newPlanIndex < currentPlanIndex) {
              // Trying to schedule same downgrade again
              throw new HttpsError(
                "already-exists", 
                `Downgrade to ${planId} plan is already scheduled for ${activeSub.scheduledDowngrade.scheduledFor.toDate().toLocaleDateString()}.`
              );
            }
          }
          
          // Determine if this is an upgrade or downgrade
          const currentPlanIndex = Object.keys(SUBSCRIPTION_PLANS).indexOf(currentPlanId);
          const newPlanIndex = Object.keys(SUBSCRIPTION_PLANS).indexOf(planId);
          
          if (newPlanIndex > currentPlanIndex) {
            // UPGRADE - apply immediately
            isImmediateUpgrade = true;
            
            // Apply pro-rate credit
            if (proRateCredit && proRateCredit > 0) {
              totalTokenCost = Math.max(0, totalTokenCost - proRateCredit);
            }
            
            // Clear any scheduled downgrade
            if (activeSub.scheduledDowngrade) {
              console.log("Clearing scheduled downgrade due to upgrade");
            }
            
            // Calculate new end date from today
            endDate = new Date(startDate);
            if (billingPeriod === "monthly") {
              endDate.setMonth(endDate.getMonth() + duration);
            } else {
              endDate.setFullYear(endDate.getFullYear() + duration);
            }
            
            // Cancel the current subscription
            transaction.update(activeSubSnapshot.docs[0].ref, {
              status: "upgraded",
              upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
              scheduledDowngrade: admin.firestore.FieldValue.delete(), // Remove any scheduled downgrade
            });
            
          } else if (newPlanIndex < currentPlanIndex) {
            // DOWNGRADE - schedule for later
            isDowngrade = true;
            totalTokenCost = 0; // No charge for downgrades
            startDate = activeEndDate; // Start when current plan ends
            endDate = activeEndDate; // Keep the same end date for now
            
            // Update or create scheduled downgrade
            const scheduledDowngradeData = {
              planId: planId,
              billingPeriod: billingPeriod,
              duration: duration,
              scheduledFor: admin.firestore.Timestamp.fromDate(activeEndDate),
            };
            
            // Mark current subscription with scheduled downgrade
            transaction.update(activeSubSnapshot.docs[0].ref, {
              autoRenew: false,
              scheduledDowngrade: scheduledDowngradeData,
            });
            
          } else {
            // SAME PLAN - treat as renewal
            throw new HttpsError(
              "failed-precondition", 
              "You already have an active " + planId + " subscription."
            );
          }
        } else {
          // NEW SUBSCRIPTION - calculate end date normally
          endDate = new Date(startDate);
          if (billingPeriod === "monthly") {
            endDate.setMonth(endDate.getMonth() + duration);
          } else {
            endDate.setFullYear(endDate.getFullYear() + duration);
          }
        }

        // Check balance
        if (currentBalance < totalTokenCost) {
          throw new HttpsError("failed-precondition", "Insufficient tokens.");
        }

        // Only create a new subscription record if it's not a downgrade
        if (!isDowngrade) {
          // Create subscription record
          const subscriptionRef = admin.firestore().collection("subscriptions").doc();
          subscriptionId = subscriptionRef.id;

          transaction.set(subscriptionRef, {
            subscriptionId,
            userId,
            planId,
            billingPeriod,
            duration,
            tokenCost: totalTokenCost,
            startDate: admin.firestore.Timestamp.fromDate(startDate),
            endDate: admin.firestore.Timestamp.fromDate(endDate),
            status: "active",
            autoRenew: false,
            isUpgrade: isImmediateUpgrade,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // Initialize request tracking
            movieRequestsUsed: 0,
            tvRequestsUsed: 0,
            lastResetDate: admin.firestore.Timestamp.fromDate(startDate),
          });
        }

        // Deduct tokens
        if (totalTokenCost > 0) {
          transaction.update(userRef, {
            tokenBalance: admin.firestore.FieldValue.increment(-totalTokenCost),
          });
        }

        // Log redemption
        const redemptionRef = admin.firestore().collection("redemptions").doc();
        if (!isDowngrade) {
          transaction.set(redemptionRef, {
            userId,
            productType: "mediaSubscription",
            productId: planId,
            tokenCost: totalTokenCost,
            subscriptionId,
            isUpgrade: isImmediateUpgrade,
            proRateCredit: isImmediateUpgrade ? proRateCredit : 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(redemptionRef, {
            userId,
            productType: "scheduledDowngrade",
            productId: planId,
            tokenCost: 0,
            scheduledFor: admin.firestore.Timestamp.fromDate(startDate),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        return {
          subscriptionId: subscriptionId || "scheduled",
          endDate: endDate.toISOString(),
          embyUserId: userData?.services?.emby?.serviceUserId || null,
          email: userData?.email || null,
          isImmediateUpgrade,
          isDowngrade,
        };
      });

      // Update services immediately if it's an upgrade or new subscription
      if (result.isImmediateUpgrade || (!hasActiveSubscription && !result.isDowngrade)) {
        if (result.embyUserId) {
          try {
            await updateEmbySubscriptionPermissions(result.embyUserId, planId);
            await syncJellyseerrUser(result.embyUserId);
            await updateJellyseerrRequestLimits(result.email, planId, result.embyUserId);
          } catch (error) {
            console.error("Failed to update services:", error);
          }
        }
      }

      return {
        success: true,
        subscriptionId: result.subscriptionId,
        endDate: result.endDate,
      };
    } catch (error: unknown) {
      console.error("Error in processSubscription:", error);
      if (error instanceof HttpsError) throw error;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Failed to process subscription: ${errorMessage}`);
    }
  }
);

// In checkSubscriptionStatus, the variables need to be declared in the right scope:

exports.checkSubscriptionStatus = onCall<CheckSubscriptionStatusData, Promise<CheckSubscriptionStatusResponse>>(
  async (request) => {
    const { userId } = request.data;
    const auth = request.auth;

    if (!auth || auth.uid !== userId) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    try {
      // Get user data FIRST (move this up)
      const userDoc = await admin.firestore().doc(`users/${userId}`).get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found in Firestore.");
      }
      const userData = userDoc.data();

      // Check for active subscriptions
      const activeSubQuery = admin
        .firestore()
        .collection("subscriptions")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .orderBy("endDate", "desc")
        .limit(1);

      const activeSubSnapshot = await activeSubQuery.get();

      if (activeSubSnapshot.empty) {
        // No active subscription - disable services
        const embyService = userData?.services?.emby;
        if (embyService?.linked && embyService?.serviceUserId) {
          try {
            await disableEmbyAccount(embyService.serviceUserId);
          } catch (error) {
            console.error("Failed to disable Emby account:", error);
          }
        }
        
        if (embyService?.serviceUserId) {
          try {
            await updateJellyseerrRequestLimits(userData?.email || "", "basic", embyService.serviceUserId);
          } catch (error) {
            console.error("Failed to disable Jellyseerr requests:", error);
          }
        }

        return { hasActiveSubscription: false };
      }

      const subData = activeSubSnapshot.docs[0].data();
      const endDate = subData.endDate.toDate();
      const now = new Date();

      if (endDate <= now) {
        // Subscription has expired
        await activeSubSnapshot.docs[0].ref.update({ status: "expired" });

        // Disable services
        const embyService = userData?.services?.emby;
        if (embyService?.linked && embyService?.serviceUserId) {
          try {
            await disableEmbyAccount(embyService.serviceUserId);
          } catch (error) {
            console.error("Failed to disable Emby account:", error);
          }
        }
        
        if (embyService?.serviceUserId) {
          try {
            await updateJellyseerrRequestLimits(userData?.email || "", "basic", embyService.serviceUserId);
          } catch (error) {
            console.error("Failed to disable Jellyseerr requests:", error);
          }
        }

        return { hasActiveSubscription: false };
      }

      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get these from subData
      const movieRequestsUsed = subData.movieRequestsUsed || 0;
      const tvRequestsUsed = subData.tvRequestsUsed || 0;
      const lastResetDate = subData.lastResetDate?.toDate()?.toISOString() || subData.startDate.toDate().toISOString();

      // Check for scheduled downgrades that need processing
      if (subData.scheduledDowngrade) {
        const scheduledFor = subData.scheduledDowngrade.scheduledFor.toDate();
        
        if (now >= scheduledFor) {
          console.log(`Processing scheduled downgrade for user ${userId}`);
          
          try {
            // Get downgrade details
            const newPlan = subData.scheduledDowngrade.planId;
            const newBillingPeriod = subData.scheduledDowngrade.billingPeriod;
            const newDuration = subData.scheduledDowngrade.duration;
            
            // Calculate new end date
            const newStartDate = scheduledFor;
            const newEndDate = new Date(newStartDate);
            
            if (newBillingPeriod === "monthly") {
              newEndDate.setMonth(newEndDate.getMonth() + newDuration);
            } else {
              newEndDate.setFullYear(newEndDate.getFullYear() + newDuration);
            }
            
            // Get plan token cost
            const plan = SUBSCRIPTION_PLANS[newPlan];
            const planTokenCost = (newBillingPeriod === "monthly" ? plan.monthly : plan.yearly) * newDuration;
            
            // Check user's current token balance
            const currentBalance = userData?.tokenBalance || 0;
            
            if (currentBalance < planTokenCost) {
              // Insufficient tokens - cancel downgrade and expire subscription
              console.log(`User ${userId} has insufficient tokens for scheduled downgrade. Required: ${planTokenCost}, Available: ${currentBalance}`);
              
              await activeSubSnapshot.docs[0].ref.update({
                scheduledDowngrade: admin.firestore.FieldValue.delete(),
                status: "expired",
                expiredAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              
              // Disable services
              const embyService = userData?.services?.emby;
              if (embyService?.linked && embyService?.serviceUserId) {
                try {
                  await disableEmbyAccount(embyService.serviceUserId);
                } catch (error) {
                  console.error("Failed to disable Emby account:", error);
                }
              }
              
              if (embyService?.serviceUserId) {
                try {
                  await updateJellyseerrRequestLimits(userData?.email || "", "basic", embyService.serviceUserId, { movieLimit: 0, tvLimit: 0 });
                } catch (error) {
                  console.error("Failed to disable Jellyseerr requests:", error);
                }
              }
              
              return { hasActiveSubscription: false };
            }
            
            // User has enough tokens - process the downgrade
            const batch = admin.firestore().batch();
            
            // Deduct tokens
            const userRef = admin.firestore().doc(`users/${userId}`);
            batch.update(userRef, {
              tokenBalance: admin.firestore.FieldValue.increment(-planTokenCost)
            });
            
            // Create new subscription
            const newSubRef = admin.firestore().collection("subscriptions").doc();
            batch.set(newSubRef, {
              subscriptionId: newSubRef.id,
              userId,
              planId: newPlan,
              billingPeriod: newBillingPeriod,
              duration: newDuration,
              tokenCost: planTokenCost,
              startDate: admin.firestore.Timestamp.fromDate(newStartDate),
              endDate: admin.firestore.Timestamp.fromDate(newEndDate),
              status: "active",
              autoRenew: false,
              fromDowngrade: true,
              previousPlanId: subData.planId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              movieRequestsUsed: 0,
              tvRequestsUsed: 0,
              lastResetDate: admin.firestore.Timestamp.fromDate(newStartDate),
            });
            
            // Create redemption log
            const redemptionRef = admin.firestore().collection("redemptions").doc();
            batch.set(redemptionRef, {
              userId,
              productType: "mediaSubscription",
              productId: newPlan,
              tokenCost: planTokenCost,
              subscriptionId: newSubRef.id,
              fromScheduledDowngrade: true,
              previousPlanId: subData.planId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            // Mark old subscription as completed
            batch.update(activeSubSnapshot.docs[0].ref, {
              status: "completed",
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              downgradedTo: newPlan,
            });
            
            // Commit all changes
            await batch.commit();
            
            // Update services
            const embyService = userData?.services?.emby;
            if (embyService?.linked && embyService?.serviceUserId) {
              await updateEmbySubscriptionPermissions(embyService.serviceUserId, newPlan);
              await updateJellyseerrRequestLimits(userData?.email || "", newPlan, embyService.serviceUserId);
            }
            
            // Return the new subscription info
            return {
              hasActiveSubscription: true,
              subscription: {
                subscriptionId: newSubRef.id,
                planId: newPlan,
                billingPeriod: newBillingPeriod,
                startDate: newStartDate.toISOString(),
                endDate: newEndDate.toISOString(),
                status: "active",
                autoRenew: false,
                daysRemaining: Math.ceil((newEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
                movieRequestsUsed: 0,
                tvRequestsUsed: 0,
                lastResetDate: newStartDate.toISOString(),
              },
            };
          } catch (error) {
            console.error("Failed to process scheduled downgrade:", error);
          }
        }
      }

      // Return with scheduled downgrade info
      return {
        hasActiveSubscription: true,
        subscription: {
          subscriptionId: subData.subscriptionId,
          planId: subData.planId,
          billingPeriod: subData.billingPeriod,
          startDate: subData.startDate.toDate().toISOString(),
          endDate: endDate.toISOString(),
          status: subData.status,
          autoRenew: subData.autoRenew || false,
          daysRemaining,
          movieRequestsUsed,
          tvRequestsUsed,
          lastResetDate,
          // Add scheduled downgrade info
          scheduledDowngrade: subData.scheduledDowngrade ? {
            planId: subData.scheduledDowngrade.planId,
            billingPeriod: subData.scheduledDowngrade.billingPeriod,
            scheduledFor: subData.scheduledDowngrade.scheduledFor.toDate().toISOString(),
          } : null,
        },
      };
    } catch (error: unknown) {
      console.error("Error in checkSubscriptionStatus:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new HttpsError("internal", `Failed to check subscription status: ${errorMessage}`);
    }
  }
);

exports.cancelScheduledDowngrade = onCall(async (request) => {
  const { userId } = request.data;
  const auth = request.auth;

  if (!auth || auth.uid !== userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  try {
    const activeSubQuery = admin
      .firestore()
      .collection("subscriptions")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .limit(1);
    
    const snapshot = await activeSubQuery.get();
    
    if (snapshot.empty) {
      throw new HttpsError("not-found", "No active subscription found.");
    }

    const subDoc = snapshot.docs[0];
    const subData = subDoc.data();
    
    if (!subData.scheduledDowngrade) {
      throw new HttpsError("not-found", "No scheduled downgrade found.");
    }

    await subDoc.ref.update({
      scheduledDowngrade: admin.firestore.FieldValue.delete(),
      autoRenew: false,
    });

    return { 
      success: true, 
      message: "Scheduled downgrade cancelled successfully." 
    };
  } catch (error: any) {
    console.error("Error cancelling downgrade:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to cancel scheduled downgrade.");
  }
});

exports.checkUsername = onCall<CheckUsernameData>(async (request) => {
  const { username } = request.data;
  if (!username || typeof username !== "string") {
    throw new HttpsError("invalid-argument", "Username is required and must be a string.");
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3) {
    throw new HttpsError("invalid-argument", "Username must be at least 3 characters long.");
  }

  try {
    const normalizedUsername = trimmedUsername.toLowerCase();
    const usersSnapshot = await admin
      .firestore()
      .collection("users")
      .where("normalizedUsername", "==", normalizedUsername)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      return { available: false };
    }

    const embyAvailable = await checkEmbyUsernameLocally(normalizedUsername);
    return { available: embyAvailable };
  } catch (error: unknown) {
    console.error("Error checking username availability:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to check username availability: ${errorMessage}`);
  }
});


exports.setupUserAccount = onCall<SetupUserAccountData>(async (request) => {
  const { email, username, password } = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  if (!email || !username || !password) {
    throw new HttpsError("invalid-argument", "Email, username, and password are required.");
  }

  if (username.trim().length < 3) {
    throw new HttpsError("invalid-argument", "Username must be at least 3 characters long.");
  }

  try {
    await accountServiceManager.setupUserAccount(auth.uid, email, username, password);
    console.log(`User setup completed for UID: ${auth.uid}, username: ${username}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error setting up user account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to setup user account: ${errorMessage}`);
  }
});

exports.syncEmbyPassword = onCall(async (request) => {
  const { username, newPassword } = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  if (!username || !newPassword) {
    throw new HttpsError("invalid-argument", "Username and newPassword are required.");
  }

  try {
    await accountServiceManager.syncPassword(username, newPassword);
    console.log(`Password synced for username: ${username}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error syncing password:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to sync password: ${errorMessage}`);
  }
});

exports.activateEmbyAccount = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = auth.uid;

  try {
    const userRef = admin.firestore().doc(`users/${uid}`);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found in Firestore.");
    }

    const userData = userDoc.data();
    const embyService = userData?.services?.emby;

    if (!embyService?.linked || !embyService?.serviceUserId) {
      throw new HttpsError("failed-precondition", "Emby account is not linked.");
    }

    await accountServiceManager.enableUser("emby", embyService.serviceUserId);

    await userRef.update({
      "services.emby.subscriptionStatus": "active",
    });

    return { success: true, message: "Emby account activated successfully." };
  } catch (error: unknown) {
    console.error("Error activating Emby account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to activate Emby account: ${errorMessage}`);
  }
});

exports.uploadProfileImage = onCall<UploadProfileImageData>(async (request) => {
  const { fileName, contentType, file } = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated to upload a profile image.");
  }

  if (!fileName || !contentType || !file) {
    throw new HttpsError("invalid-argument", "Missing required fields: fileName, contentType, file.");
  }

  const supportedTypes = ["image/png", "image/jpeg", "image/jpg", "image/bmp"];
  if (!supportedTypes.includes(contentType.toLowerCase())) {
    throw new HttpsError("invalid-argument", "Unsupported file type. Use PNG, JPEG, JPG, or BMP.");
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const buffer = Buffer.from(file, "base64");
  if (buffer.length > MAX_FILE_SIZE) {
    throw new HttpsError("invalid-argument", "File size exceeds 5MB limit.");
  }

  if (!isValidMagicBytes(buffer, contentType.toLowerCase())) {
    throw new HttpsError("invalid-argument", "File content does not match the declared MIME type.");
  }

  const uid = auth.uid;
  const fileExtension = path.extname(fileName).toLowerCase() || ".jpg";
  const storagePath = `users/${uid}/profile${fileExtension}`;

  const tempFilePath = path.join(os.tmpdir(), `${uid}_${Date.now()}${fileExtension}`);
  let tempFileDeleted = false;

  try {
    await fs.promises.writeFile(tempFilePath, buffer);
    console.log(`Temp file written to: ${tempFilePath}, size: ${buffer.length} bytes`);

    const uploadToken = `${uid}_${Date.now()}`;
    const [uploadedFile] = await BUCKET.upload(tempFilePath, {
      destination: storagePath,
      metadata: {
        contentType: contentType.toLowerCase(),
        metadata: { firebaseStorageDownloadTokens: uploadToken },
      },
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET.name}/o/${encodeURIComponent(
      uploadedFile.name
    )}?alt=media&token=${uploadToken}`;
    console.log(`Profile image uploaded successfully, URL: ${publicUrl}`);

    const userRef = admin.firestore().doc(`users/${uid}`);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found in Firestore.");
    }

    const userData = userDoc.data();
    const normalizedUsername = userData?.normalizedUsername;
    if (!normalizedUsername) {
      throw new HttpsError("not-found", "Normalized username not found for user.");
    }

    await userRef.update({ profileImage: publicUrl });
    console.log(`Firestore updated with profile image URL for user ${uid}`);

    try {
      await accountServiceManager.syncProfileImage(normalizedUsername, publicUrl, contentType.toLowerCase());
      console.log(`Profile image synced to Emby for user ${uid}`);
    } catch (syncError: unknown) {
      console.error("Failed to sync profile image to Emby (non-critical):", syncError);
    }

    try {
      await fs.promises.unlink(tempFilePath);
      tempFileDeleted = true;
      console.log(`Temp file deleted: ${tempFilePath}`);
    } catch (cleanupError) {
      console.error("Failed to delete temp file (non-critical):", cleanupError);
    }

    return {
      success: true,
      message: "Profile image uploaded successfully",
      url: publicUrl,
      storagePath,
    };
  } catch (error: unknown) {
    if (!tempFileDeleted && tempFilePath) {
      try {
        await fs.promises.unlink(tempFilePath);
        console.log(`Temp file deleted after error: ${tempFilePath}`);
      } catch (cleanupError) {
        console.error("Failed to delete temp file after error (non-critical):", cleanupError);
      }
    }

    console.error("Error uploading profile image:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", `Failed to upload profile image: ${errorMessage}`);
  }
});
