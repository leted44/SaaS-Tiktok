/**
 * Central, typed access to environment variables.
 * Optional integrations degrade gracefully: the app boots without keys and
 * exposes clear "not configured" states in the UI instead of crashing.
 */
const read = (key: string, fallback = ""): string => process.env[key] ?? fallback;

export const env = {
  appUrl: read("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  isProd: process.env.NODE_ENV === "production",

  anthropicApiKey: read("ANTHROPIC_API_KEY"),
  anthropicModel: read("ANTHROPIC_MODEL", "claude-opus-5"),

  elevenLabsApiKey: read("ELEVENLABS_API_KEY"),
  elevenLabsModelId: read("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),

  storageDriver: read("STORAGE_DRIVER", "local") as "local" | "s3",
  s3: {
    endpoint: read("S3_ENDPOINT"),
    region: read("S3_REGION", "us-east-1"),
    bucket: read("S3_BUCKET", "clipforge"),
    accessKeyId: read("S3_ACCESS_KEY_ID"),
    secretAccessKey: read("S3_SECRET_ACCESS_KEY"),
    publicUrl: read("S3_PUBLIC_URL"),
  },

  renderEngine: read("RENDER_ENGINE", "local") as "local" | "lambda",
  remotion: {
    region: read("REMOTION_AWS_REGION", "us-east-1"),
    functionName: read("REMOTION_LAMBDA_FUNCTION_NAME"),
    serveUrl: read("REMOTION_SERVE_URL"),
  },
  cronSecret: read("CRON_SECRET"),

  stripe: {
    secretKey: read("STRIPE_SECRET_KEY"),
    webhookSecret: read("STRIPE_WEBHOOK_SECRET"),
    publishableKey: read("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    prices: {
      CREATOR: { month: read("STRIPE_PRICE_CREATOR_MONTHLY"), year: read("STRIPE_PRICE_CREATOR_YEARLY") },
      PRO: { month: read("STRIPE_PRICE_PRO_MONTHLY"), year: read("STRIPE_PRICE_PRO_YEARLY") },
      AGENCY: { month: read("STRIPE_PRICE_AGENCY_MONTHLY"), year: read("STRIPE_PRICE_AGENCY_YEARLY") },
    },
    creditPacks: {
      credits_100: read("STRIPE_PRICE_CREDITS_100"),
      credits_500: read("STRIPE_PRICE_CREDITS_500"),
      credits_2000: read("STRIPE_PRICE_CREDITS_2000"),
    },
  },

  social: {
    tiktok: { clientKey: read("TIKTOK_CLIENT_KEY"), clientSecret: read("TIKTOK_CLIENT_SECRET") },
    youtube: { clientId: read("YOUTUBE_CLIENT_ID"), clientSecret: read("YOUTUBE_CLIENT_SECRET") },
    instagram: { appId: read("INSTAGRAM_APP_ID"), appSecret: read("INSTAGRAM_APP_SECRET") },
  },
  tokenEncryptionKey: read("TOKEN_ENCRYPTION_KEY"),
} as const;

export const integrations = {
  ai: () => Boolean(env.anthropicApiKey),
  tts: () => Boolean(env.elevenLabsApiKey),
  stripe: () => Boolean(env.stripe.secretKey),
  s3: () => env.storageDriver === "s3" && Boolean(env.s3.accessKeyId),
  tiktok: () => Boolean(env.social.tiktok.clientKey),
  youtube: () => Boolean(env.social.youtube.clientId),
  instagram: () => Boolean(env.social.instagram.appId),
};
