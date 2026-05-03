import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: { sub: string; email: string; tokenId?: string };
  }
}
