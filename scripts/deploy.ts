import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const tokenName = process.env.TOKEN_NAME || "X402 Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "X402";
  const initialSupply = process.env.INITIAL_SUPPLY 
    ? ethers.parseEther(process.env.INITIAL_SUPPLY)
    : ethers.parseEther("1000000");
  
  const registrationFee = process.env.REGISTRATION_FEE
    ? ethers.parseEther(process.env.REGISTRATION_FEE)
    : ethers.parseEther("10");
  
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const protocolFeePercent = process.env.PROTOCOL_FEE_PERCENT
    ? parseInt(process.env.PROTOCOL_FEE_PERCENT)
    : 500;

  console.log("\n=== Deployment Parameters ===");
  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);
  console.log("Initial Supply:", ethers.formatEther(initialSupply));
  console.log("Registration Fee:", ethers.formatEther(registrationFee));
  console.log("Fee Recipient:", feeRecipient);
  console.log("Protocol Fee Percent:", protocolFeePercent, "(", protocolFeePercent / 100, "%)");

  console.log("\n=== Deploying X402Token ===");
  const X402TokenFactory = await ethers.getContractFactory("X402Token");
  const token = await X402TokenFactory.deploy(tokenName, tokenSymbol, initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("X402Token deployed to:", tokenAddress);

  console.log("\n=== Deploying NodeRegistry ===");
  const NodeRegistryFactory = await ethers.getContractFactory("NodeRegistry");
  const registry = await NodeRegistryFactory.deploy(tokenAddress, registrationFee);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("NodeRegistry deployed to:", registryAddress);

  console.log("\n=== Deploying SessionManager ===");
  const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
  const sessionManager = await SessionManagerFactory.deploy(
    tokenAddress,
    registryAddress,
    feeRecipient,
    protocolFeePercent
  );
  await sessionManager.waitForDeployment();
  const sessionManagerAddress = await sessionManager.getAddress();
  console.log("SessionManager deployed to:", sessionManagerAddress);

  const deployment = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      X402Token: {
        address: tokenAddress,
        args: [tokenName, tokenSymbol, initialSupply.toString()],
      },
      NodeRegistry: {
        address: registryAddress,
        args: [tokenAddress, registrationFee.toString()],
      },
      SessionManager: {
        address: sessionManagerAddress,
        args: [tokenAddress, registryAddress, feeRecipient, protocolFeePercent],
      },
    },
    configuration: {
      tokenName,
      tokenSymbol,
      initialSupply: ethers.formatEther(initialSupply),
      registrationFee: ethers.formatEther(registrationFee),
      feeRecipient,
      protocolFeePercent,
    },
  };

  const deploymentDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const networkName = (await ethers.provider.getNetwork()).name === "unknown" 
    ? "hardhat" 
    : (await ethers.provider.getNetwork()).name;
  const filename = path.join(deploymentDir, `${networkName}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(deployment, null, 2));
  console.log("\n=== Deployment Info Saved ===");
  console.log("File:", filename);

  console.log("\n=== Deployment Summary ===");
  console.log("X402Token:", tokenAddress);
  console.log("NodeRegistry:", registryAddress);
  console.log("SessionManager:", sessionManagerAddress);
  console.log("\nDeployment completed successfully!");

  return deployment;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
