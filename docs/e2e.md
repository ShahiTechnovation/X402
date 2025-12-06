# X402 End-to-End Validation

This guide proves the full lifecycle of the X402 protocol: minting the token,
depositing funds, starting a session, accruing 5 minutes of usage, settling,
stopping, claiming node earnings, and withdrawing the leftover balance. You can
run it in automation (Hardhat script) or manually for exploratory testing.

---

## 1. Objectives

1. Deploy fresh instances of `X402Token`, `NodeRegistry`, and `SessionManager` on
   a local Hardhat network.
2. Execute the happy-path flow:
   - Mint tokens to operator and user accounts.
   - Operator registers a node with a fixed hourly rate.
   - User deposits funds, starts a session, and accrues exactly five minutes of
     usage by advancing block time.
   - Protocol settles the session, refunds the remainder, node operator claims
     earnings, treasury collects protocol fees.
3. Validate balances after every step and ensure the economics match the
   expected 5-minute scenario.

---

## 2. Automated Harness (`scripts/e2e-scenario.ts`)

The repository now exposes a Hardhat script that performs the entire flow. Run
it against the in-memory Hardhat network (default) or `localhost` (Anvil/Hardhat
node).

```bash
npm install   # if not already installed
npx hardhat run scripts/e2e-scenario.ts --network hardhat
# or use the shortcut alias
npm run e2e:local
```

Sample output:
```
[X402][deploy] X402Token -> 0x5FbD...
[X402][session] Session started with ID 0x...
[X402][economics] Expected usage cost 0.833333333333333333 X402
[X402][economics] Actual settled cost 0.83611111111111111 X402
[X402][refund] User refunded 9.16388888888888889 X402
[X402][registry] Node earnings 0.794305555555555556 X402
[X402][balances] Treasury withdrew 0.041805555555555554 X402 in fees
[X402] ✅ End-to-end scenario completed successfully
```

> Because Hardhat mines each transaction in a fresh block, the `stopSession`
> call necessarily advances the timestamp by **one extra second**. The harness
> tolerates this ±1 second drift (≈0.00278 X402) while still validating the true
> 5-minute economics outlined below.

The script enforces the numeric expectations (see Section 4) and throws if any
balance mismatch occurs. Because it manipulates time via `evm_increaseTime`, it
must run on a controllable network (`hardhat`, `localhost`). On public chains,
you would have to wait the real-time interval.

---

## 3. Manual Test Plan

| Step | Actor | Command / Action | Expected Result |
| --- | --- | --- | --- |
| 1 | Operator | `npx hardhat console` → deploy contracts (or reuse deployed addresses). | Addresses recorded. |
| 2 | Operator | Approve registry & `registerNode("wireguard://node-1.example.com", rate=10 X402/hr)`. | `NodeRegistered` event emitted. |
| 3 | User | Approve SessionManager and `startSession(nodeId=0, maxSpend=10, deposit=10)`. | `SessionStarted` log captured, balance decreases by 10 X402. |
| 4 | System | Advance chain time by 300 seconds (`await network.provider.send("evm_increaseTime", [300])`). | Session still active. |
| 5 | Anyone | `settleSession(sessionId)` | `SessionSettled` emits with cost `0.833333333333333333` X402, `protocolFee=0.041666666666666666` X402. |
| 6 | User | `stopSession(sessionId)` | Refund credited (deposit − settled). Session becomes inactive. |
| 7 | Operator | `claimEarnings(0)` | Node wallet receives `0.791666666666666667` X402. |
| 8 | Owner | `withdrawProtocolFees()` | Treasury receives `0.041666666666666666` X402. |
| 9 | Validation | Query token balances for operator, user, treasury. | Totals reconcile with conservation of value. |

Take notes as you proceed so you can link tx hashes (on Base Sepolia) back to the
runbook.

---

## 4. Economics for the 5-Minute Scenario

Parameters used by the script:

| Parameter | Value |
| --- | --- |
| Hourly node rate | 10 X402 (10e18 wei) |
| Protocol fee | 500 bps (5%) |
| Elapsed time | 300 seconds (5 minutes) |
| Deposit / maxSpend | 10 X402 |

Derived expectations:

| Metric | Calculation | Expected Value |
| --- | --- | --- |
| Cost | `rate * elapsed / 3600` | `0.833333333333333333` X402 |
| Protocol fee | `cost * 0.05` | `0.041666666666666666` X402 |
| Node earning | `cost - fee` | `0.791666666666666667` X402 |
| Refund to user | `deposit - cost` | `9.166666666666666667` X402 |

> ℹ️ Hardhat enforces strictly increasing block timestamps, so the automated
> harness observes an "actual" settled value of `0.83611111111111111` X402 when it
> immediately calls `stopSession` after settlement. The script verifies that the
> actual value stays within one second (≈0.00278 X402) of the theoretical cost
> above, then checks that node earnings + protocol fees equal the settled amount.

The automated harness asserts all four of the above. When running manually, use
`ethers.formatEther` inside Hardhat console to confirm.

---

## 5. Wiring Secrets & Runtime Variables

- The script never embeds private keys; it relies on the default Hardhat
  signers. When replaying on Base Sepolia, export `PRIVATE_KEY` and `BASE_SEPOLIA_RPC_URL`
  or load them via `.env`.
- For simulated time travel on localhost, the `hardhat` network allows
  `evm_increaseTime`. If you migrate the script to Anvil, use `anvil_setBlockTimestampInterval`.
- To drive a real node agent as part of an E2E rehearsal, point `X402_RPC_URL`
  in `/etc/x402/node-agent.env` to your local Hardhat node (e.g., `http://127.0.0.1:8545`)
  and ensure its signing key has enough ETH + X402 tokens. Run the harness with
  `HARDHAT_NETWORK=localhost` so both scripts share the same chain.

---

## 6. Extending the Harness

- **Multiple Sessions**: duplicate the `startSession` block in `scripts/e2e-scenario.ts`
  to spin up parallel sessions across two nodes; verify aggregated earning splits.
- **Failure Testing**: temporarily pause `SessionManager` (`await sessionManager.pause()`)
  to confirm the scripts handle reverts and produce actionable logs.
- **CI Integration**: add `npm run e2e:local` to your GitHub Actions workflow so
  every PR proves economic integrity before merge (remember to provision enough
  CPU time for Hardhat).

Refer back to [`docs/deployment.md`](./deployment.md) for infrastructure prep and
[`infra/README.md`](../infra/README.md) for the provisioning script that the
harness assumes is already running.
