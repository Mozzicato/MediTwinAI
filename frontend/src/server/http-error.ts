/** An error whose message is safe to show to the user, with the HTTP status to send. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}
