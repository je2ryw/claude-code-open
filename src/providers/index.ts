/**
 * Cloud Provider Support
 * AWS Bedrock, Google Vertex AI, and Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
import * as https from 'https';
import * as crypto from 'crypto';

export type ProviderType = 'anthropic' | 'bedrock' | 'vertex' | 'foundry';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  region?: string;
  projectId?: string;
  baseUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  model?: string;
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  region?: string;
  model: string;
  baseUrl: string;
}

/**
 * Detect provider from environment
 */
export function detectProvider(): ProviderConfig {
  // Check for Bedrock
  if (process.env.CLAUDE_CODE_USE_BEDROCK === 'true' || process.env.AWS_BEDROCK_MODEL) {
    return {
      type: 'bedrock',
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      model: process.env.AWS_BEDROCK_MODEL || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      baseUrl: process.env.ANTHROPIC_BEDROCK_BASE_URL,
    };
  }

  // Check for Vertex
  if (process.env.CLAUDE_CODE_USE_VERTEX === 'true' || process.env.ANTHROPIC_VERTEX_PROJECT_ID) {
    return {
      type: 'vertex',
      projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
      region: process.env.CLOUD_ML_REGION || 'us-central1',
      baseUrl: process.env.ANTHROPIC_VERTEX_BASE_URL,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-v2@20241022',
    };
  }

  // Check for Foundry
  if (process.env.CLAUDE_CODE_USE_FOUNDRY === 'true' || process.env.ANTHROPIC_FOUNDRY_API_KEY) {
    return {
      type: 'foundry',
      apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY,
      baseUrl: process.env.ANTHROPIC_FOUNDRY_BASE_URL,
      model: process.env.ANTHROPIC_MODEL,
    };
  }

  // Default to Anthropic
  return {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  };
}

/**
 * Get provider info for display
 */
export function getProviderInfo(config: ProviderConfig): ProviderInfo {
  switch (config.type) {
    case 'bedrock':
      return {
        type: 'bedrock',
        name: 'AWS Bedrock',
        region: config.region,
        model: config.model || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        baseUrl: config.baseUrl || `https://bedrock-runtime.${config.region}.amazonaws.com`,
      };
    case 'vertex':
      return {
        type: 'vertex',
        name: 'Google Vertex AI',
        region: config.region,
        model: config.model || 'claude-3-5-sonnet-v2@20241022',
        baseUrl: config.baseUrl || `https://${config.region}-aiplatform.googleapis.com`,
      };
    case 'foundry':
      return {
        type: 'foundry',
        name: 'Anthropic Foundry',
        model: config.model || 'claude-sonnet-4-20250514',
        baseUrl: config.baseUrl || 'https://foundry.anthropic.com',
      };
    default:
      return {
        type: 'anthropic',
        name: 'Anthropic API',
        model: config.model || 'claude-sonnet-4-20250514',
        baseUrl: config.baseUrl || 'https://api.anthropic.com',
      };
  }
}

/**
 * Create Anthropic client based on provider
 */
export function createClient(config?: ProviderConfig): Anthropic {
  const providerConfig = config || detectProvider();

  switch (providerConfig.type) {
    case 'bedrock':
      return createBedrockClient(providerConfig);
    case 'vertex':
      return createVertexClient(providerConfig);
    case 'foundry':
      return createFoundryClient(providerConfig);
    default:
      return new Anthropic({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl,
      });
  }
}

/**
 * Create AWS Bedrock client
 */
function createBedrockClient(config: ProviderConfig): Anthropic {
  // Use AnthropicBedrock if available
  try {
    const AnthropicBedrock = require('@anthropic-ai/bedrock-sdk').default;
    return new AnthropicBedrock({
      awsAccessKey: config.accessKeyId,
      awsSecretKey: config.secretAccessKey,
      awsSessionToken: config.sessionToken,
      awsRegion: config.region,
    });
  } catch {
    // Fallback to standard client with bedrock base URL
    console.warn('Bedrock SDK not found, using standard client');
    return new Anthropic({
      apiKey: config.accessKeyId || 'bedrock',
      baseURL: config.baseUrl || `https://bedrock-runtime.${config.region}.amazonaws.com`,
    });
  }
}

/**
 * Create Google Vertex client
 */
function createVertexClient(config: ProviderConfig): Anthropic {
  // Use AnthropicVertex if available
  try {
    const AnthropicVertex = require('@anthropic-ai/vertex-sdk').default;
    return new AnthropicVertex({
      projectId: config.projectId,
      region: config.region,
    });
  } catch {
    // Fallback to standard client
    console.warn('Vertex SDK not found, using standard client');
    return new Anthropic({
      apiKey: config.apiKey || 'vertex',
      baseURL: config.baseUrl,
    });
  }
}

/**
 * Create Foundry client
 */
function createFoundryClient(config: ProviderConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://foundry.anthropic.com',
  });
}

/**
 * AWS Signature V4 helper (for manual Bedrock requests)
 */
export function signAWSRequest(
  method: string,
  url: string,
  body: string,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    service: string;
  }
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname;
  const canonicalQueryString = parsedUrl.searchParams.toString();

  // Hash the body
  const payloadHash = crypto
    .createHash('sha256')
    .update(body)
    .digest('hex');

  // Create canonical headers
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-date:${amzDate}`,
    ...(credentials.sessionToken ? [`x-amz-security-token:${credentials.sessionToken}`] : []),
  ].join('\n') + '\n';

  const signedHeaders = credentials.sessionToken
    ? 'host;x-amz-date;x-amz-security-token'
    : 'host;x-amz-date';

  // Create canonical request
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  // Calculate signature
  const getSignatureKey = (key: string, date: string, region: string, service: string) => {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  };

  const signingKey = getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    credentials.region,
    credentials.service
  );

  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');

  // Create authorization header
  const authorization = [
    `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const headers: Record<string, string> = {
    Authorization: authorization,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
  };

  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }

  return headers;
}

/**
 * Model mapping for different providers
 */
export const MODEL_MAPPING: Record<ProviderType, Record<string, string>> = {
  anthropic: {
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
    'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-3-opus': 'claude-3-opus-20240229',
    'claude-3-haiku': 'claude-3-haiku-20240307',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  },
  bedrock: {
    'claude-sonnet-4-20250514': 'anthropic.claude-sonnet-4-20250514-v1:0',
    'claude-3-5-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
    'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
    'claude-3-5-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
  },
  vertex: {
    'claude-sonnet-4-20250514': 'claude-sonnet-4@20250514',
    'claude-3-5-sonnet': 'claude-3-5-sonnet-v2@20241022',
    'claude-3-opus': 'claude-3-opus@20240229',
    'claude-3-haiku': 'claude-3-haiku@20240307',
    'claude-3-5-haiku': 'claude-3-5-haiku@20241022',
  },
  foundry: {
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
    'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-3-opus': 'claude-3-opus-20240229',
    'claude-3-haiku': 'claude-3-haiku-20240307',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  },
};

/**
 * Get model ID for provider
 */
export function getModelForProvider(model: string, provider: ProviderType): string {
  const mapping = MODEL_MAPPING[provider];
  return mapping[model] || model;
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ProviderConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  switch (config.type) {
    case 'bedrock':
      if (!config.region) {
        errors.push('AWS region is required for Bedrock');
      }
      if (!config.accessKeyId && !process.env.AWS_ACCESS_KEY_ID) {
        errors.push('AWS access key ID is required for Bedrock');
      }
      if (!config.secretAccessKey && !process.env.AWS_SECRET_ACCESS_KEY) {
        errors.push('AWS secret access key is required for Bedrock');
      }
      break;

    case 'vertex':
      if (!config.projectId) {
        errors.push('Google Cloud project ID is required for Vertex');
      }
      if (!config.region) {
        errors.push('Google Cloud region is required for Vertex');
      }
      break;

    case 'foundry':
      if (!config.apiKey) {
        errors.push('API key is required for Foundry');
      }
      break;

    default:
      if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
        errors.push('API key is required for Anthropic');
      }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(type: ProviderType): string {
  switch (type) {
    case 'bedrock':
      return 'AWS Bedrock';
    case 'vertex':
      return 'Google Vertex AI';
    case 'foundry':
      return 'Anthropic Foundry';
    default:
      return 'Anthropic API';
  }
}
