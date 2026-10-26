export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RequestError(
      "CONNECTION_ERROR",
      "The local backend is unavailable. Start it and try again.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      "INVALID_RESPONSE",
      "The local backend returned an unexpected response.",
    );
  }
  if (!response.ok)
    throw new RequestError(
      data.code ?? "REQUEST_FAILED",
      data.error ?? "Request failed.",
    );
  return data as T;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RequestError(
      "CONNECTION_ERROR",
      "The local backend could not be reached.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      "INVALID_RESPONSE",
      "The local backend returned an unexpected response.",
    );
  }
  if (!response.ok)
    throw new RequestError(
      data.code ?? "REQUEST_FAILED",
      data.error ?? "Request failed.",
    );
  return data as T;
}
