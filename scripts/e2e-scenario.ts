import { strict as assert } from "node:assert";
import { ContractTransactionReceipt } from "ethers";
import { ethers, network } from "hardhat";
import type { SessionManager } from "../typechain-types";

const SECONDS_PER_HOUR = 3600n;
const FIVE_MINUTES = 300n;
const RATE_PER_HOUR = ethers.parseEther("10");
const REGISTRATION_FEE = ethers.parseEther("10");
const INITIAL_SUPPLY = ethers.parseEther("1000000");
const PROTOCOL_FEE_BPS = 500n; // 5%
const DEPOSIT = ethers.parseEther("10");
const MAX_SPEND = DEPOSIT;
const PER_SECOND_COST = RATE_PER_HOUR / SECONDS_PER_HOUR + 1n; // ceil

async function advanceTime(seconds: bigint, anchor?: bigint) {
  const secondsNumber = Number(seconds);

  if (network.name === "hardhat" || network.name === "localhost") {
    if (typeof anchor === "bigint") {
      const target = Number(anchor + seconds);
      await network.provider.send("evm_setNextBlockTimestamp", [target]);
    } else {
      await network.provider.send("evm_increaseTime", [secondsNumber]);
      await network.provider.send("evm_mine", []);
    }
  } else {
    console.warn(
      `[X402][time] Network ${network.name} does not support time travel. Waiting ${secondsNumber}s...`
    );
    await new Promise((resolve) => setTimeout(resolve, secondsNumber * 1000));
  }
}

function format(amount: bigint): string {
  return ethers.formatEther(amount);
}

function assertWithinTolerance(actual: bigint, expected: bigint, tolerance: bigint, label: string) {
  const diff = actual > expected ? actual - expected : expected - actual;
  assert(diff <= tolerance, `${label} differed by more than tolerance`);
}

async function main() {
  const [deployer, operator, user, treasury] = await ethers.getSigners();

  console.log(`[X402][accounts] deployer=${deployer.address}`);

  const tokenFactory = await ethers.getContractFactory("X402Token");
  const token = await tokenFactory.deploy("X402 Token", "X402", INITIAL_SUPPLY);
  await token.waitForDeployment();
  console.log(`[X402][deploy] X402Token -> ${await token.getAddress()}`);

  const registryFactory = await ethers.getContractFactory("NodeRegistry");
  const registry = await registryFactory.deploy(await token.getAddress(), REGISTRATION_FEE);
  await registry.waitForDeployment();
  console.log(`[X402][deploy] NodeRegistry -> ${await registry.getAddress()}`);

  const sessionManagerFactory = await ethers.getContractFactory("SessionManager");
  const sessionManager = (await sessionManagerFactory.deploy(
    await token.getAddress(),
    await registry.getAddress(),
    treasury.address,
    Number(PROTOCOL_FEE_BPS)
  )) as SessionManager;
  await sessionManager.waitForDeployment();
  console.log(`[X402][deploy] SessionManager -> ${await sessionManager.getAddress()}`);

  await token.transfer(operator.address, ethers.parseEther("1000"));
  await token.transfer(user.address, ethers.parseEther("1000"));

  const operatorBalanceBefore = await token.balanceOf(operator.address);
  const userBalanceBefore = await token.balanceOf(user.address);

  await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
  await registry
    .connect(operator)
    .registerNode("wireguard://vpn-node-1.example.com:51820", RATE_PER_HOUR);

  console.log("[X402][registry] Node 0 registered at", format(RATE_PER_HOUR), "X402/hour");

  await token.connect(user).approve(await sessionManager.getAddress(), DEPOSIT);
  const startReceipt = await (
    await sessionManager.connect(user).startSession(0, MAX_SPEND, DEPOSIT)
  ).wait();

  const sessionId = extractSessionId(sessionManager, startReceipt);
  console.log(`[X402][session] Session started with ID ${sessionId}`);

  const userBalanceAfterDeposit = await token.balanceOf(user.address);
  assert.equal(
    userBalanceBefore - userBalanceAfterDeposit,
    DEPOSIT,
    "deposit should deduct from user balance"
  );

  const sessionBeforeSettle = await sessionManager.getSession(sessionId);

  await advanceTime(FIVE_MINUTES, sessionBeforeSettle.lastSettleTime);
  await (await sessionManager.settleSession(sessionId)).wait();

  await (await sessionManager.connect(user).stopSession(sessionId)).wait();

  const sessionAfterStop = await sessionManager.getSession(sessionId);
  const actualSettled = sessionAfterStop.settled;
  const expectedCost = (RATE_PER_HOUR * FIVE_MINUTES) / SECONDS_PER_HOUR;
  const tolerance = PER_SECOND_COST;

  console.log(`[X402][economics] Expected usage cost ${format(expectedCost)} X402`);
  console.log(`[X402][economics] Actual settled cost ${format(actualSettled)} X402`);

  assertWithinTolerance(actualSettled, expectedCost, tolerance, "settled amount");

  const userBalanceAfterStop = await token.balanceOf(user.address);
  const spent = userBalanceBefore - userBalanceAfterStop;
  assert.equal(spent, actualSettled, "user spend should match settled amount");

  const refund = userBalanceAfterStop - userBalanceAfterDeposit;
  assert.equal(refund, DEPOSIT - actualSettled, "refund mismatch");
  console.log(`[X402][refund] User refunded ${format(refund)} X402`);

  const node = await registry.getNode(0);
  const nodeEarnings = node.earnings;
  console.log(`[X402][registry] Node earnings ${format(nodeEarnings)} X402`);

  const operatorBalanceBeforeClaim = await token.balanceOf(operator.address);
  await registry.connect(operator).claimEarnings(0);
  const operatorBalanceAfterClaim = await token.balanceOf(operator.address);
  const claimed = operatorBalanceAfterClaim - operatorBalanceBeforeClaim;
  assert.equal(claimed, nodeEarnings, "operator claim mismatch");
  console.log(`[X402][balances] Operator claimed ${format(claimed)} X402`);

  const protocolFeeAccrued = actualSettled - nodeEarnings;
  const totalProtocolFees = await sessionManager.totalProtocolFees();
  assert.equal(totalProtocolFees, protocolFeeAccrued, "protocol fee tally mismatch");

  const treasuryBalanceBefore = await token.balanceOf(treasury.address);
  await sessionManager.withdrawProtocolFees();
  const treasuryBalanceAfter = await token.balanceOf(treasury.address);
  const withdrawn = treasuryBalanceAfter - treasuryBalanceBefore;
  assert.equal(withdrawn, protocolFeeAccrued, "treasury withdraw mismatch");
  console.log(`[X402][balances] Treasury withdrew ${format(withdrawn)} X402 in fees`);

  assert.equal(sessionAfterStop.active, false, "session should be inactive");

  console.log("[X402] ✅ End-to-end scenario completed successfully");
}

function extractSessionId(sessionManager: SessionManager, receipt: ContractTransactionReceipt | null): string {
  if (!receipt) {
    throw new Error("Missing transaction receipt");
  }

  for (const log of receipt.logs) {
    try {
      const parsed = sessionManager.interface.parseLog(log);
      if (parsed?.name === "SessionStarted") {
        return parsed.args[0];
      }
    } catch {
      // ignore logs that do not belong to SessionManager
    }
  }

  throw new Error("Unable to find SessionStarted log");
}

main().catch((error) => {
  console.error("[X402][error]", error);
  process.exitCode = 1;
});
