import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Initialize the Secret Manager client
const client = new SecretManagerServiceClient();

// Cache for secrets to avoid multiple fetches
const secretCache: { [key: string]: string } = {};

/**
 * Access a secret from Google Secret Manager
 * @param secretName The name of the secret (e.g., 'EMBY_API_KEY')
 * @returns The secret value as a string
 */
export async function getSecret(secretName: string): Promise<string> {
  // Check cache first
  if (secretCache[secretName]) {
    return secretCache[secretName];
  }

  try {
    // Get project ID from environment
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      throw new Error('Project ID not found in environment variables');
    }

    // Build the secret name
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

    // Access the secret
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();

    if (!payload) {
      throw new Error(`Secret ${secretName} has no data`);
    }

    // Cache the secret
    secretCache[secretName] = payload;
    
    return payload;
  } catch (error) {
    console.error(`Error accessing secret ${secretName}:`, error);
    throw new Error(`Failed to access secret: ${secretName}`);
  }
}

/**
 * Get all required secrets for the application
 */
export async function getAllSecrets(): Promise<{
  EMBY_API_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PAYPAL_API_BASE: string;
  PAYPAL_CLIENT_ID_SANDBOX: string;
  PAYPAL_SECRET_SANDBOX: string;
  PAYPAL_API_BASE_SANDBOX: string;
  JELLYSEERR_API_KEY: string;
}> {
  const [
    embyApiKey,
    paypalClientId,
    paypalSecret,
    paypalApiBase,
    paypalClientIdSandbox,
    paypalSecretSandbox,
    paypalApiBaseSandbox,
    jellyseerrApiKey
  ] = await Promise.all([
    getSecret('EMBY_API_KEY'),
    getSecret('PAYPAL_CLIENT_ID'),
    getSecret('PAYPAL_SECRET'),
    getSecret('PAYPAL_API_BASE'),
    getSecret('PAYPAL_CLIENT_ID_SANDBOX'),
    getSecret('PAYPAL_SECRET_SANDBOX'),
    getSecret('PAYPAL_API_BASE_SANDBOX'),
    getSecret('JELLYSEERR_API_KEY'),
  ]);

  return {
    EMBY_API_KEY: embyApiKey,
    PAYPAL_CLIENT_ID: paypalClientId,
    PAYPAL_SECRET: paypalSecret,
    PAYPAL_API_BASE: paypalApiBase,
    PAYPAL_CLIENT_ID_SANDBOX: paypalClientIdSandbox,
    PAYPAL_SECRET_SANDBOX: paypalSecretSandbox,
    PAYPAL_API_BASE_SANDBOX: paypalApiBaseSandbox,
    JELLYSEERR_API_KEY: jellyseerrApiKey,
  };
}