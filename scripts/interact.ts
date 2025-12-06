import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  const deploymentFile = path.join(process.cwd(), "deployments", `${networkName}.json`);

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.log("Please deploy the contracts first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const [signer] = await ethers.getSigners();

  console.log("=== X402 Protocol Interaction ===");
  console.log("Network:", networkName);
  console.log("Account:", signer.address);
  console.log();

  const token = await ethers.getContractAt("X402Token", deployment.contracts.X402Token.address);
  const registry = await ethers.getContractAt("NodeRegistry", deployment.contracts.NodeRegistry.address);
  const sessionManager = await ethers.getContractAt("SessionManager", deployment.contracts.SessionManager.address);

  console.log("=== Contract Addresses ===");
  console.log("X402Token:", deployment.contracts.X402Token.address);
  console.log("NodeRegistry:", deployment.contracts.NodeRegistry.address);
  console.log("SessionManager:", deployment.contracts.SessionManager.address);
  console.log();

  console.log("=== Token Information ===");
  console.log("Name:", await token.name());
  console.log("Symbol:", await token.symbol());
  console.log("Total Supply:", ethers.formatEther(await token.totalSupply()));
  console.log("Your Balance:", ethers.formatEther(await token.balanceOf(signer.address)));
  console.log();

  console.log("=== Registry Information ===");
  console.log("Node Count:", (await registry.nodeCount()).toString());
  console.log("Registration Fee:", ethers.formatEther(await registry.registrationFee()));
  console.log();

  console.log("=== Session Manager Information ===");
  console.log("Fee Recipient:", await sessionManager.feeRecipient());
  console.log("Protocol Fee Percent:", (await sessionManager.protocolFeePercent()).toString(), "basis points");
  console.log("Total Protocol Fees:", ethers.formatEther(await sessionManager.totalProtocolFees()));
  console.log();

  const nodeCount = Number(await registry.nodeCount());
  if (nodeCount > 0) {
    console.log("=== Registered Nodes ===");
    for (let i = 0; i < Math.min(nodeCount, 5); i++) {
      const node = await registry.getNode(i);
      console.log(`Node ${i}:`);
      console.log("  Operator:", node.operator);
      console.log("  Endpoint:", node.endpoint);
      console.log("  Rate:", ethers.formatEther(node.rate), "tokens/hour");
      console.log("  Active:", node.active);
      console.log("  Earnings:", ethers.formatEther(node.earnings));
      console.log();
    }
    if (nodeCount > 5) {
      console.log(`... and ${nodeCount - 5} more nodes`);
      console.log();
    }
  }

  const userSessions = await sessionManager.getUserSessions(signer.address);
  if (userSessions.length > 0) {
    console.log("=== Your Sessions ===");
    for (let i = 0; i < Math.min(userSessions.length, 5); i++) {
      const session = await sessionManager.getSession(userSessions[i]);
      console.log(`Session ${i + 1}:`);
      console.log("  Node ID:", session.nodeId.toString());
      console.log("  Deposited:", ethers.formatEther(session.deposited));
      console.log("  Settled:", ethers.formatEther(session.settled));
      console.log("  Active:", session.active);
      console.log();
    }
    if (userSessions.length > 5) {
      console.log(`... and ${userSessions.length - 5} more sessions`);
      console.log();
    }
  }

  console.log("=== Available Commands ===");
  console.log("To register a node:");
  console.log('  npx hardhat run scripts/register-node.ts --network', networkName);
  console.log();
  console.log("To start a session:");
  console.log('  npx hardhat run scripts/start-session.ts --network', networkName);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
