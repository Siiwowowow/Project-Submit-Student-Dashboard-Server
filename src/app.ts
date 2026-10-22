import express from "express";
import cors from "cors";
import { envVars } from "./app/config/env.js";
import { IndexRoutes } from "./app/routes/index.js";
import { notFound } from "./app/middleware/notFound.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import { requestLogger } from "./app/middleware/requestLogger.js";

const app = express();
app.disable("x-powered-by");
if (envVars.NODE_ENV === "development") app.use(requestLogger);
// Configure this only when the deployment has a known reverse-proxy hop count.
if (envVars.TRUST_PROXY_HOPS) app.set("trust proxy", envVars.TRUST_PROXY_HOPS);
app.use(cors({ origin: envVars.FRONTEND_URL, methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "32kb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Project submission and review API is running." });
});
app.use("/api/v1", IndexRoutes);
app.use(notFound);
app.use(globalErrorHandler);

export default app;
