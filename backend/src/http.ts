export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown): Response {
  if (error instanceof ApiError)
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  return json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "The service could not finish this request. Please try again shortly.",
      },
    },
    503,
  );
}
export async function boundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The requested data exceeds the size limit.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let result = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The requested data exceeds the size limit.",
        );
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "JSON_REQUIRED", "Send a JSON request.");
  try {
    const value = JSON.parse(
      await boundedText(
        new Response(request.body, { headers: request.headers }),
        8192,
      ),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "The request is not valid JSON.",
    );
  }
}
export function textField(value: unknown, max = 512): string {
  if (typeof value !== "string" || value.length > max)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "A required value is missing or too long.",
    );
  return value;
}
