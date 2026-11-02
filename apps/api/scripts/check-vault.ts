import { config } from "../src/config.js";
import {
  checkAuthorization,
  getAgentView,
  usdcToUnits,
  vaultMode,
} from "../src/lib/vault.js";

const view = await getAgentView();
const auth = await checkAuthorization(config.payToAddress, usdcToUnits(100));

console.log({
  vaultMode: vaultMode(),
  vault: config.vaultAddress,
  vaultRpc: config.vaultRpcUrl,
  vaultChainId: config.vaultChainId,
  balanceUsdc: Number(view.balance) / 1e6,
  policyExists: view.policy.exists,
  maxPerPaymentUsdc: Number(view.policy.maxPerPayment) / 1e6,
  auth100: auth,
});
