interface Env {
  EMAIL: SendEmail;
  SUPPORT_API_URL: string;
  SUPPORT_WORKER_SECRET: string;
  SUPPORT_FROM_EMAIL: string;
  SUPPORT_FALLBACK_FORWARD_EMAIL?: string;
  MAX_EMAIL_BYTES?: string;
}

type SendRequest = {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string;
  ticketNumber?: string;
};

type EmailSendBody = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export default {
  async email(message, env, ctx): Promise<void> {
    const maxBytes = Number(env.MAX_EMAIL_BYTES || "10485760");
    if (message.rawSize > maxBytes) {
      message.setReject("Message too large");
      return;
    }

    try {
      const raw = await streamToArrayBuffer(message.raw);
      const payload = {
        envelopeFrom: message.from,
        envelopeTo: message.to,
        rawBase64: arrayBufferToBase64(raw),
        rawSize: message.rawSize,
        headers: selectedHeaders(message.headers),
      };

      const response = await fetch(`${trimTrailingSlash(env.SUPPORT_API_URL)}/api/support/email/inbound`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.SUPPORT_WORKER_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Produktive API returned ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error("Support email ingestion failed", error);
      const fallback = (env.SUPPORT_FALLBACK_FORWARD_EMAIL || "").trim();
      if (fallback) {
        await message.forward(fallback, fallbackHeaders(error));
        return;
      }
      message.setReject("Internal support email processing error");
    }
  },

  async fetch(request, env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/send") {
      return new Response("Not found", { status: 404 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== env.SUPPORT_WORKER_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as SendRequest;
    const validation = validateSendRequest(body);
    if (validation) {
      return Response.json({ error: validation }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    if (body.inReplyTo) headers["In-Reply-To"] = body.inReplyTo;
    if (body.references) headers["References"] = body.references;
    if (body.messageId) headers["Message-ID"] = body.messageId;
    if (body.ticketNumber) headers["X-Produktive-Support-Ticket"] = body.ticketNumber;

    const email: EmailSendBody = {
      to: body.to,
      from: body.from || env.SUPPORT_FROM_EMAIL,
      subject: body.subject,
      text: body.text,
      html: body.html,
      headers,
    };

    try {
      const result = await env.EMAIL.send(email);
      return Response.json({ messageId: result.messageId });
    } catch (error) {
      console.error("Support email send failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Email send failed" },
        { status: 502 },
      );
    }
  },
} satisfies ExportedHandler<Env>;

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  return new Response(stream).arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function selectedHeaders(headers: Headers): Record<string, string> {
  const names = [
    "subject",
    "message-id",
    "in-reply-to",
    "references",
    "from",
    "to",
    "cc",
    "date",
    "reply-to",
  ];
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

function fallbackHeaders(error: unknown): Headers {
  const headers = new Headers();
  headers.set("X-Produktive-Support-Ingestion", "failed");
  headers.set("X-Produktive-Support-Error", error instanceof Error ? error.message.slice(0, 500) : "unknown");
  return headers;
}

function validateSendRequest(body: SendRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  if (!body.to || typeof body.to !== "string") return "to is required";
  if (!body.subject || typeof body.subject !== "string") return "subject is required";
  if (!body.text || typeof body.text !== "string") return "text is required";
  return null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
