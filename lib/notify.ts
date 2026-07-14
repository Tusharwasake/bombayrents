// Server-only notification helpers for the match cron.
//
// Email: AWS SES when AWS creds are configured, else Resend, else skipped.
// SMS:   AWS SNS (transactional), enabled with SMS_ENABLED=true.
//
// "skipped" means not configured — callers may still record the match so
// notifications flow once creds are added. "failed" means a real send error —
// callers should retry on the next run where it matters.

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

export type SendResult = "sent" | "skipped" | "failed";

const region = process.env.AWS_REGION;
const hasAws = !!(
  region &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

// Lazy singletons — route runs serverless, keep cold starts cheap.
let ses: SESv2Client | null = null;
let sns: SNSClient | null = null;

function fromAddress(): string {
  return process.env.MATCH_FROM_EMAIL ?? "BombayRent <onboarding@resend.dev>";
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendResult> {
  if (hasAws) {
    try {
      ses ??= new SESv2Client({ region });
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: fromAddress(),
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: { Html: { Data: html, Charset: "UTF-8" } },
            },
          },
        })
      );
      return "sent";
    } catch {
      return "failed";
    }
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** "98XXXXXXXX" → "+9198XXXXXXXX"; already-E.164 numbers pass through. */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

export async function sendSms(
  phone: string | null,
  message: string
): Promise<SendResult> {
  if (!phone || !hasAws || process.env.SMS_ENABLED !== "true") return "skipped";
  const e164 = toE164(phone);
  if (!e164) return "failed";
  try {
    sns ??= new SNSClient({ region });
    await sns.send(
      new PublishCommand({
        PhoneNumber: e164,
        Message: message,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        },
      })
    );
    return "sent";
  } catch {
    return "failed";
  }
}
