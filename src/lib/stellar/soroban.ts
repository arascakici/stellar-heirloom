import { rpc } from "@stellar/stellar-sdk";

import { network } from "./network";

/**
 * One Soroban RPC client for the whole app. Contract reads and invocations go
 * through here; classic operations (balances, the heartbeat payment) still use
 * Horizon. Kept in one place so the endpoint is configured once.
 */
export const soroban = new rpc.Server(network.sorobanRpcUrl);
