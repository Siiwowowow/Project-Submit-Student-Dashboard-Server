import { RequestHandler } from "express";

// Keep development requests visible without logging passwords, tokens or body data.
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  // Capture before nested routers temporarily shorten req.path.
  const requestPath = req.path;

  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    const message = `${req.method} ${requestPath} ${res.statusCode} - ${duration}ms`;

    if (res.statusCode >= 400) {
      console.warn(`[Request failed] ${message}`);
    } else {
      console.log(`[Request] ${message}`);
    }
  });

  next();
};
