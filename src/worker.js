export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead" && request.method === "POST") {
      return handleLead(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleLead(request, env) {
  const contentType = request.headers.get("content-type") || "";
  let data = {};

  if (contentType.includes("application/json")) {
    data = await request.json();
  } else {
    const formData = await request.formData();
    data = Object.fromEntries(formData.entries());
  }

  // Honeypot — bots fill this, humans don't
  const honeypot = (data.company || "").toString().trim();
  if (honeypot) {
    return Response.redirect(new URL("/thanks.html", request.url), 302);
  }

  const payload = {
    fullName: (data.full_name || "").trim(),
    phone:    (data.phone    || "").trim(),
    email:    (data.email    || "").trim(),
    city:     (data.city     || "").trim(),
    need:     (data.need     || "").trim(),
  };

  const missing = ["fullName", "phone", "email", "city"].filter((k) => !payload[k]);
  if (missing.length) {
    return new Response("Missing required fields.", { status: 400 });
  }

  const resendKey = env.RESEND_API_KEY;
  const emailTo   = (env.LEAD_EMAIL_TO || "").split(",").map(e => e.trim()).filter(Boolean);
  const emailFrom = env.LEAD_EMAIL_FROM;

  if (!resendKey || !emailTo.length || !emailFrom) {
    return new Response("Email service not configured.", { status: 500 });
  }

  const subject = `New EZ Gutters lead — ${payload.fullName}`;
  const html = `
    <h2>New Lead from EZ Gutters website</h2>
    <p><strong>Name:</strong> ${payload.fullName}</p>
    <p><strong>Phone:</strong> ${payload.phone}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>City:</strong> ${payload.city}</p>
    <p><strong>Need:</strong> ${payload.need || "Not provided"}</p>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: emailFrom, to: emailTo, subject, html }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Resend error:", errText);
    return new Response("Failed to send email.", { status: 502 });
  }

  return Response.redirect(new URL("/thanks.html", request.url), 302);
}
