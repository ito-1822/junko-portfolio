const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TURNSTILE_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body, status, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const isAllowedOrigin = origin === env.ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return isAllowedOrigin
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : jsonResponse({ error: "Origin not allowed." }, 403);
    }

    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "contact-api" }, 200);
    }

    if (request.method !== "POST" || !isAllowedOrigin) {
      return jsonResponse({ error: "Request not allowed." }, 403);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 20_000) {
      return jsonResponse({ error: "Request is too large." }, 413, origin);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid request." }, 400, origin);
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const message = typeof data.message === "string" ? data.message.trim() : "";
    const turnstileToken =
      typeof data.turnstileToken === "string" ? data.turnstileToken : "";
    const website = typeof data.website === "string" ? data.website : "";

    // Hidden honeypot field: pretend success so simple bots do not retry.
    if (website) {
      return jsonResponse({ ok: true }, 200, origin);
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      name.length < 1 ||
      name.length > 100 ||
      !emailPattern.test(email) ||
      email.length > 254 ||
      message.length < 1 ||
      message.length > 5_000 ||
      !turnstileToken
    ) {
      return jsonResponse(
        { error: "入力内容を確認してください。" },
        400,
        origin,
      );
    }

    const verificationBody = new FormData();
    verificationBody.set("secret", env.TURNSTILE_SECRET_KEY);
    verificationBody.set("response", turnstileToken);
    verificationBody.set(
      "remoteip",
      request.headers.get("CF-Connecting-IP") || "",
    );

    const verificationResponse = await fetch(TURNSTILE_ENDPOINT, {
      method: "POST",
      body: verificationBody,
    });
    const verification = await verificationResponse.json();

    if (!verification.success) {
      return jsonResponse(
        { error: "認証に失敗しました。もう一度お試しください。" },
        400,
        origin,
      );
    }

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Website Contact <contact@send.junkotsuruoka.me>",
        to: [env.CONTACT_TO],
        reply_to: email,
        subject: `Webサイトからのお問い合わせ：${name.replace(/\s+/g, " ")}`,
        text: [
          "Webサイトからお問い合わせが届きました。",
          "",
          `お名前: ${name}`,
          `メールアドレス: ${email}`,
          "",
          "お問い合わせ内容:",
          message,
        ].join("\n"),
      }),
    });

    if (!resendResponse.ok) {
      console.error("Resend request failed:", resendResponse.status);
      return jsonResponse(
        { error: "送信に失敗しました。時間をおいて再度お試しください。" },
        502,
        origin,
      );
    }

    return jsonResponse({ ok: true }, 200, origin);
  },
};
