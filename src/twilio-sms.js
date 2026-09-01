/**
 * Shared Twilio SMS helper — ported from /twilio/src/index.js (source of truth
 * for this project's SMS architecture). Calls the Twilio REST API directly
 * with fetch() — no Twilio SDK (not Workers/edge compatible) — same approach
 * used by the standalone lead-sms-worker.
 *
 * Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_PHONE_NUMBER) and the admin/client numbers (ADMIN_PHONE_NUMBER,
 * CLIENT_PHONE_NUMBER) come ONLY from this Worker's environment
 * variables/secrets. Never hardcode them here, never send them to the
 * frontend.
 */

// E.164: leading "+", then 1-15 digits, first digit non-zero.
const E164_RE = /^\+[1-9]\d{1,14}$/;

/** Strips whitespace/formatting chars and coerces a raw phone string to E.164-ish shape. */
export function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  let cleaned = raw.trim().replace(/[\s().-]/g, "");
  if (!cleaned.startsWith("+")) {
    // No country code provided — assume US/Canada, this project's market.
    cleaned = `+1${cleaned.replace(/\D/g, "")}`;
  } else {
    cleaned = `+${cleaned.slice(1).replace(/\D/g, "")}`;
  }
  return cleaned;
}

export function isValidPhone(phone) {
  return typeof phone === "string" && E164_RE.test(phone);
}

/** Masks a phone number for safe logging, e.g. +14175551234 -> +1417***1234 */
function maskPhone(phone) {
  if (typeof phone !== "string" || phone.length < 6) return "***";
  return `${phone.slice(0, 5)}***${phone.slice(-4)}`;
}

async function sendSMS(to, body, env) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const params = new URLSearchParams({
    To: to,
    From: env.TWILIO_PHONE_NUMBER,
    Body: body,
  });

  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.message) detail = errJson.message;
    } catch {
      // ignore — non-JSON error body
    }
    // Never include the Twilio credentials used above in this message.
    throw new Error(`Twilio send failed (to=${maskPhone(to)}): ${detail}`);
  }

  return response.json();
}

function adminMessage(websiteName, lead) {
  return `NEW LEAD - ${websiteName}\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email || "N/A"}\nService: ${lead.service || "N/A"}\nMessage: ${lead.message || "N/A"}`;
}

function clientMessage(websiteName, lead) {
  return `New lead received for ${websiteName}.\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email || "N/A"}\n\nPlease contact the customer as soon as possible.`;
}

function customerMessage(websiteName, lead) {
  const firstName = lead.name.split(/\s+/)[0];
  return `Hi ${firstName}, thanks for contacting ${websiteName}. We received your request and our team will contact you shortly.`;
}

/**
 * Sends the 3-message lead notification set: admin + client (required) and a
 * best-effort customer confirmation.
 *
 * `env` must provide TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_PHONE_NUMBER, ADMIN_PHONE_NUMBER, CLIENT_PHONE_NUMBER.
 * `lead` must be `{ name, phone, email, service, message }` with `phone`
 * already normalized/validated E.164.
 *
 * Returns `{ adminOk, clientOk, customerOk }` — never throws, so a Twilio
 * outage never blocks lead capture (email/CRM) for the rest of the request.
 * Failures are logged server-side only; credentials are never included.
 */
export async function sendLeadSms({ env, websiteName, lead }) {
  const result = { adminOk: false, clientOk: false, customerOk: false };

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    console.warn(`lead: Twilio not configured, skipping SMS (${websiteName})`);
    return result;
  }

  const [adminSettled, clientSettled] = await Promise.allSettled([
    env.ADMIN_PHONE_NUMBER
      ? sendSMS(env.ADMIN_PHONE_NUMBER, adminMessage(websiteName, lead), env)
      : Promise.reject(new Error("ADMIN_PHONE_NUMBER not configured")),
    env.CLIENT_PHONE_NUMBER
      ? sendSMS(env.CLIENT_PHONE_NUMBER, clientMessage(websiteName, lead), env)
      : Promise.reject(new Error("CLIENT_PHONE_NUMBER not configured")),
  ]);

  result.adminOk = adminSettled.status === "fulfilled";
  result.clientOk = clientSettled.status === "fulfilled";

  if (!result.adminOk) {
    console.error(`lead: admin SMS failed (${websiteName})`, { error: String(adminSettled.reason && adminSettled.reason.message) });
  }
  if (!result.clientOk) {
    console.error(`lead: client SMS failed (${websiteName})`, { error: String(clientSettled.reason && clientSettled.reason.message) });
  }

  try {
    await sendSMS(lead.phone, customerMessage(websiteName, lead), env);
    result.customerOk = true;
  } catch (err) {
    console.error(`lead: customer confirmation SMS failed (${websiteName})`, { error: String(err && err.message) });
  }

  return result;
}
