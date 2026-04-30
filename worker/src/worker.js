const ALLOWED_ORIGINS = new Set([
  "https://mpalu.io",
  "https://www.mpalu.io"
]);

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 2000;
const MAX_BODY_BYTES = 8 * 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESEND_API_URL = "https://api.resend.com/emails";

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...corsHeaders(origin)
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHeaderValue(str) {
  return String(str).replace(/[\r\n\t\0]/g, "").trim().slice(0, 200);
}

async function verifyTurnstile(token, secret, remoteip) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteip) formData.append("remoteip", remoteip);
  const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: formData });
  if (!res.ok) return { success: false };
  return res.json();
}

async function sendEmail(env, { name, email, message, lang, ip }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);
  const safeLang = escapeHtml(lang);
  const safeIp = escapeHtml(ip || "");

  const textBody =
`New contact form submission

Name:    ${name}
Email:   ${email}
Lang:    ${lang}
IP:      ${ip || "-"}

Message:
${message}
`;

  const htmlBody =
`<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;">
<h2 style="margin:0 0 12px">New contact form submission</h2>
<table style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:2px 8px;color:#666">Name</td><td style="padding:2px 8px">${safeName}</td></tr>
<tr><td style="padding:2px 8px;color:#666">Email</td><td style="padding:2px 8px">${safeEmail}</td></tr>
<tr><td style="padding:2px 8px;color:#666">Lang</td><td style="padding:2px 8px">${safeLang}</td></tr>
<tr><td style="padding:2px 8px;color:#666">IP</td><td style="padding:2px 8px">${safeIp}</td></tr>
</table>
<h3 style="margin:16px 0 8px">Message</h3>
<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f6f6f7;padding:12px;border-radius:6px">${safeMessage}</pre>
</body></html>`;

  const payload = {
    from: env.MAIL_FROM,
    to: [env.MAIL_TO],
    reply_to: sanitizeHeaderValue(email),
    subject: sanitizeHeaderValue(`Contact form — ${name}`),
    text: textBody,
    html: htmlBody
  };

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend error: ${res.status} ${text}`);
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, origin);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(403, { error: "origin_not_allowed" }, origin);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse(415, { error: "unsupported_media_type" }, origin);
    }

    const lengthHeader = request.headers.get("Content-Length");
    if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "payload_too_large" }, origin);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return jsonResponse(413, { error: "payload_too_large" }, origin);
      }
      body = JSON.parse(raw);
    } catch {
      return jsonResponse(400, { error: "invalid_json" }, origin);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const hp = typeof body.hp === "string" ? body.hp : "";
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const lang = typeof body.lang === "string" ? body.lang.slice(0, 10) : "";

    if (hp) {
      return jsonResponse(200, { ok: true }, origin);
    }

    if (!name || name.length > MAX_NAME) return jsonResponse(400, { error: "invalid_name" }, origin);
    if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
      return jsonResponse(400, { error: "invalid_email" }, origin);
    }
    if (!message || message.length > MAX_MESSAGE) {
      return jsonResponse(400, { error: "invalid_message" }, origin);
    }

    if (env.TURNSTILE_SECRET) {
      if (!turnstileToken) return jsonResponse(400, { error: "captcha_required" }, origin);
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const verdict = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip);
      if (!verdict.success) {
        return jsonResponse(403, { error: "captcha_failed" }, origin);
      }
    }

    try {
      const ip = request.headers.get("CF-Connecting-IP") || "";
      await sendEmail(env, { name, email, message, lang, ip });
      return jsonResponse(200, { ok: true }, origin);
    } catch (err) {
      console.error("send_error", err && err.message);
      return jsonResponse(502, { error: "send_failed" }, origin);
    }
  }
};
