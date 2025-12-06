import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "baseSepolia";
  const deploymentFile = path.join(process.cwd(), "deployments", `${networkName}.json`);

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.log("Please deploy the contracts first using: npx hardhat run scripts/deploy.ts --network", networkName);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));

  console.log("=== Verifying Contracts on", networkName, "===\n");

  try {
    console.log("Verifying X402Token...");
    await run("verify:verify", {
      address: deployment.contracts.X402Token.address,
      constructorArguments: [
        deployment.contracts.X402Token.args[0],
        deployment.contracts.X402Token.args[1],
        deployment.contracts.X402Token.args[2],
      ],
    });
    console.log("✓ X402Token verified\n");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ X402Token already verified\n");
    } else {
      console.error("✗ Error verifying X402Token:", error.message, "\n");
    }
  }

  try {
    console.log("Verifying NodeRegistry...");
    await run("verify:verify", {
      address: deployment.contracts.NodeRegistry.address,
      constructorArguments: [
        deployment.contracts.NodeRegistry.args[0],
        deployment.contracts.NodeRegistry.args[1],
      ],
    });
    console.log("✓ NodeRegistry verified\n");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ NodeRegistry already verified\n");
    } else {
      console.error("✗ Error verifying NodeRegistry:", error.message, "\n");
    }
  }

  try {
    console.log("Verifying SessionManager...");
    await run("verify:verify", {
      address: deployment.contracts.SessionManager.address,
      constructorArguments: [
        deployment.contracts.SessionManager.args[0],
        deployment.contracts.SessionManager.args[1],
        deployment.contracts.SessionManager.args[2],
        deployment.contracts.SessionManager.args[3],
      ],
    });
    console.log("✓ SessionManager verified\n");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ SessionManager already verified\n");
    } else {
      console.error("✗ Error verifying SessionManager:", error.message, "\n");
    }
  }

  console.log("=== Verification Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
