import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes/index.js";

const app = express();

app.use(
  cors({
    origin: true,
  }),
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

app.use("/api", router);

app.get("/", (_req, res) => {
  res.json({
    name: "Charter",
    tagline:
      "Human Not Present payments. Approve Intent Mandate once; Claude/Grok settle on HSP via API. Platform agent wallet signs.",
    health: "/api/health",
    rails: "/api/rails",
    connect: "/api/v1/connect",
    humanApi: "/api/charters",
    agentApi: "/api/v1 (Bearer chlive_…)",
    merchantName: config.merchantName,
    payer: config.agentAddress,
    hspMode: config.hspMode,
  });
});

app.listen(config.port, () => {
  console.log(`Charter API on http://localhost:${config.port}`);
  console.log(`  Team/merchant_name: ${config.merchantName}`);
  console.log(`  HSP mode: ${config.hspMode}  mcp: ${config.hspMcpUrl}`);
  console.log(`  Payer (fund this): ${config.agentAddress}`);
  console.log(`  Pay to: ${config.payToAddress}`);
  console.log(`  Vault: ${config.vaultAddress || "memory"}`);
  console.log(`  Agent connect: GET /api/v1/connect`);
});
