import app from "./app.js";
import { config } from "./config.js";

export default app;

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Charter API on http://localhost:${config.port}`);
    console.log(`  Team/merchant_name: ${config.merchantName}`);
    console.log(`  HSP mode: ${config.hspMode}  mcp: ${config.hspMcpUrl}`);
    console.log(`  Payer (fund this): ${config.agentAddress}`);
    console.log(`  Pay to: ${config.payToAddress}`);
    console.log(`  Vault: ${config.vaultAddress || "memory"}`);
    console.log(`  Agent connect: GET /api/v1/connect`);
  });
}
