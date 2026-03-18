/**
 * SMS Provider abstraction layer.
 * Supports multiple providers with automatic failover.
 */

export interface SmsResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  send(phone: string, message: string): Promise<SmsResult>;
}

// ── Kudi SMS Provider ──

export class KudiProvider implements SmsProvider {
  name = 'kudi';

  constructor(private apiKey: string) {}

  async send(phone: string, message: string): Promise<SmsResult> {
    try {
      const res = await fetch('https://account.kudisms.net/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.apiKey,
          senderID: 'CLiDE',
          recipients: phone,
          message,
        }),
      });

      const data = await res.json<{ status?: string; message_id?: string; error?: string }>();

      if (res.ok && data.status === 'success') {
        return { success: true, provider: this.name, messageId: data.message_id };
      }

      return { success: false, provider: this.name, error: data.error || `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, provider: this.name, error: String(err) };
    }
  }
}

// ── Termii SMS Provider ──

export class TermiiProvider implements SmsProvider {
  name = 'termii';

  constructor(private apiKey: string) {}

  async send(phone: string, message: string): Promise<SmsResult> {
    try {
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: 'CLiDE',
          sms: message,
          type: 'plain',
          channel: 'generic',
          api_key: this.apiKey,
        }),
      });

      const data = await res.json<{ message_id?: string; message?: string }>();

      if (res.ok && data.message_id) {
        return { success: true, provider: this.name, messageId: data.message_id };
      }

      return { success: false, provider: this.name, error: data.message || `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, provider: this.name, error: String(err) };
    }
  }
}

// ── Africa's Talking SMS Provider ──

export class AfricasTalkingProvider implements SmsProvider {
  name = 'africastalking';

  constructor(private apiKey: string, private username: string) {}

  async send(phone: string, message: string): Promise<SmsResult> {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      const params = new URLSearchParams({
        username: this.username,
        to: formattedPhone,
        message,
      });

      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          apiKey: this.apiKey,
        },
        body: params,
      });

      const data = await res.json<{
        SMSMessageData?: {
          Recipients?: Array<{ messageId: string; status: string; statusCode: number }>;
        };
      }>();

      const recipient = data.SMSMessageData?.Recipients?.[0];
      if (recipient && recipient.statusCode === 101) {
        return { success: true, provider: this.name, messageId: recipient.messageId };
      }

      return {
        success: false,
        provider: this.name,
        error: recipient?.status || `HTTP ${res.status}`,
      };
    } catch (err) {
      return { success: false, provider: this.name, error: String(err) };
    }
  }
}

// ── Provider Manager with Failover ──

export class SmsProviderManager {
  private providers: SmsProvider[] = [];

  addProvider(provider: SmsProvider): void {
    this.providers.push(provider);
  }

  /**
   * Send SMS with automatic failover to next provider on failure.
   */
  async send(phone: string, message: string): Promise<SmsResult> {
    if (this.providers.length === 0) {
      return { success: false, provider: 'none', error: 'No SMS providers configured' };
    }

    for (const provider of this.providers) {
      const result = await provider.send(phone, message);
      if (result.success) {
        return result;
      }
      console.warn(`SMS provider ${provider.name} failed: ${result.error}`);
    }

    // All providers failed
    return {
      success: false,
      provider: this.providers[this.providers.length - 1].name,
      error: 'All SMS providers failed',
    };
  }
}

/**
 * Create the SMS provider manager from environment variables.
 * Used as fallback when no workspace-specific config exists.
 */
export function createSmsManager(env: {
  KUDI_API_KEY?: string;
  TERMII_API_KEY?: string;
  AT_API_KEY?: string;
  AT_USERNAME?: string;
}): SmsProviderManager {
  const manager = new SmsProviderManager();

  if (env.KUDI_API_KEY) {
    manager.addProvider(new KudiProvider(env.KUDI_API_KEY));
  }
  if (env.TERMII_API_KEY) {
    manager.addProvider(new TermiiProvider(env.TERMII_API_KEY));
  }
  if (env.AT_API_KEY && env.AT_USERNAME) {
    manager.addProvider(new AfricasTalkingProvider(env.AT_API_KEY, env.AT_USERNAME));
  }

  return manager;
}

/**
 * Workspace SMS config row shape from D1.
 */
export interface WorkspaceSmsConfig {
  provider_priority: string;
  kudi_api_key: string | null;
  termii_api_key: string | null;
  at_api_key: string | null;
  at_username: string | null;
}

/**
 * Create the SMS provider manager from workspace-specific config,
 * falling back to global env keys for any provider not configured per-workspace.
 */
export function createSmsManagerFromConfig(
  config: WorkspaceSmsConfig,
  env: {
    KUDI_API_KEY?: string;
    TERMII_API_KEY?: string;
    AT_API_KEY?: string;
    AT_USERNAME?: string;
  }
): SmsProviderManager {
  const manager = new SmsProviderManager();

  const providerOrder = config.provider_priority
    .split(',')
    .map(p => p.trim().toLowerCase());

  const providerFactories: Record<string, () => void> = {
    kudi: () => {
      const key = config.kudi_api_key || env.KUDI_API_KEY;
      if (key) manager.addProvider(new KudiProvider(key));
    },
    termii: () => {
      const key = config.termii_api_key || env.TERMII_API_KEY;
      if (key) manager.addProvider(new TermiiProvider(key));
    },
    africastalking: () => {
      const key = config.at_api_key || env.AT_API_KEY;
      const username = config.at_username || env.AT_USERNAME;
      if (key && username) manager.addProvider(new AfricasTalkingProvider(key, username));
    },
  };

  for (const provider of providerOrder) {
    providerFactories[provider]?.();
  }

  return manager;
}
