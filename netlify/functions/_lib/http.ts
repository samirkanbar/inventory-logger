export type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function json(body: Json, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

export function error(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

export function preflight(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return null;
}

export function binary(buf: ArrayBuffer | Uint8Array, filename: string, contentType: string) {
  return new Response(buf, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
