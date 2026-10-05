// Throw one of these anywhere in a route to send a clean error response.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
