import { expect } from "chai";
import { ethers } from "hardhat";
import { X402Token, NodeRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NodeRegistry", function () {
  let token: X402Token;
  let registry: NodeRegistry;
  let owner: SignerWithAddress;
  let operator1: SignerWithAddress;
  let operator2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REGISTRATION_FEE = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, operator1, operator2] = await ethers.getSigners();

    const X402TokenFactory = await ethers.getContractFactory("X402Token");
    token = await X402TokenFactory.deploy("X402 Token", "X402", INITIAL_SUPPLY);
    await token.waitForDeployment();

    const NodeRegistryFactory = await ethers.getContractFactory("NodeRegistry");
    registry = await NodeRegistryFactory.deploy(await token.getAddress(), REGISTRATION_FEE);
    await registry.waitForDeployment();

    await token.transfer(operator1.address, ethers.parseEther("10000"));
    await token.transfer(operator2.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await registry.token()).to.equal(await token.getAddress());
    });

    it("Should set the correct registration fee", async function () {
      expect(await registry.registrationFee()).to.equal(REGISTRATION_FEE);
    });

    it("Should set the correct owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("Node Registration", function () {
    it("Should register a node successfully", async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      
      const endpoint = "https://node1.example.com";
      const region = "us-east-1";
      const metadataURI = "ipfs://QmTest123";
      const ratePerMinute = ethers.parseEther("10");

      await expect(registry.connect(operator1).registerNode(endpoint, region, metadataURI, ratePerMinute))
        .to.emit(registry, "NodeRegistered")
        .withArgs(0, operator1.address, endpoint, region, metadataURI, ratePerMinute);

      const node = await registry.getNode(0);
      expect(node.operator).to.equal(operator1.address);
      expect(node.endpoint).to.equal(endpoint);
      expect(node.region).to.equal(region);
      expect(node.metadataURI).to.equal(metadataURI);
      expect(node.ratePerMinute).to.equal(ratePerMinute);
      expect(node.active).to.be.true;
    });

    it("Should increment node count", async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"));

      expect(await registry.nodeCount()).to.equal(1);
    });

    it("Should fail with empty endpoint", async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await expect(
        registry.connect(operator1).registerNode("", "us-east-1", "ipfs://test", ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(registry, "InvalidEndpoint");
    });

    it("Should fail with zero rate", async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await expect(
        registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", 0)
      ).to.be.revertedWithCustomError(registry, "InvalidRate");
    });

    it("Should fail without sufficient allowance", async function () {
      await expect(
        registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("Should track operator nodes", async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE * 2n);
      await registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test1", ethers.parseEther("10"));
      await registry.connect(operator1).registerNode("https://node2.example.com", "us-west-1", "ipfs://test2", ethers.parseEther("15"));

      const operatorNodes = await registry.getOperatorNodes(operator1.address);
      expect(operatorNodes.length).to.equal(2);
      expect(operatorNodes[0]).to.equal(0);
      expect(operatorNodes[1]).to.equal(1);
    });
  });

  describe("Node Updates", function () {
    beforeEach(async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"));
    });

    it("Should update node endpoint, region, metadata, and rate", async function () {
      const newEndpoint = "https://node1-updated.example.com";
      const newRegion = "eu-west-1";
      const newMetadataURI = "ipfs://QmUpdated456";
      const newRate = ethers.parseEther("20");

      await expect(registry.connect(operator1).updateNode(0, newEndpoint, newRegion, newMetadataURI, newRate))
        .to.emit(registry, "NodeUpdated")
        .withArgs(0, newEndpoint, newRegion, newMetadataURI, newRate);

      const node = await registry.getNode(0);
      expect(node.endpoint).to.equal(newEndpoint);
      expect(node.region).to.equal(newRegion);
      expect(node.metadataURI).to.equal(newMetadataURI);
      expect(node.ratePerMinute).to.equal(newRate);
    });

    it("Should fail if not operator", async function () {
      await expect(
        registry.connect(operator2).updateNode(0, "https://test.com", "us-east-1", "ipfs://test", ethers.parseEther("20"))
      ).to.be.revertedWithCustomError(registry, "NotOperator");
    });

    it("Should fail with empty endpoint", async function () {
      await expect(
        registry.connect(operator1).updateNode(0, "", "us-east-1", "ipfs://test", ethers.parseEther("20"))
      ).to.be.revertedWithCustomError(registry, "InvalidEndpoint");
    });

    it("Should fail with zero rate", async function () {
      await expect(
        registry.connect(operator1).updateNode(0, "https://test.com", "us-east-1", "ipfs://test", 0)
      ).to.be.revertedWithCustomError(registry, "InvalidRate");
    });
  });

  describe("Node Deactivation", function () {
    beforeEach(async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"));
    });

    it("Should deactivate a node", async function () {
      await expect(registry.connect(operator1).deactivateNode(0))
        .to.emit(registry, "NodeDeactivated")
        .withArgs(0);

      const node = await registry.getNode(0);
      expect(node.active).to.be.false;
    });

    it("Should fail if not operator", async function () {
      await expect(
        registry.connect(operator2).deactivateNode(0)
      ).to.be.revertedWithCustomError(registry, "NotOperator");
    });

    it("Should fail if already inactive", async function () {
      await registry.connect(operator1).deactivateNode(0);
      await expect(
        registry.connect(operator1).deactivateNode(0)
      ).to.be.revertedWithCustomError(registry, "AlreadyInactive");
    });

    it("Should reactivate a node", async function () {
      await registry.connect(operator1).deactivateNode(0);
      
      await expect(registry.connect(operator1).reactivateNode(0))
        .to.emit(registry, "NodeReactivated")
        .withArgs(0);

      const node = await registry.getNode(0);
      expect(node.active).to.be.true;
    });
  });

  describe("Earnings Management", function () {
    beforeEach(async function () {
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"));
    });

    it("Should add earnings to a node", async function () {
      const earnings = ethers.parseEther("100");
      await registry.addEarnings(0, earnings);

      const node = await registry.getNode(0);
      expect(node.earnings).to.equal(earnings);
    });

    it("Should allow operator to claim earnings", async function () {
      const earnings = ethers.parseEther("100");
      await token.transfer(await registry.getAddress(), earnings);
      await registry.addEarnings(0, earnings);

      const balanceBefore = await token.balanceOf(operator1.address);

      await expect(registry.connect(operator1).claimEarnings(0))
        .to.emit(registry, "EarningsClaimed")
        .withArgs(0, operator1.address, earnings);

      const balanceAfter = await token.balanceOf(operator1.address);
      expect(balanceAfter).to.equal(balanceBefore + earnings);

      const node = await registry.getNode(0);
      expect(node.earnings).to.equal(0);
    });

    it("Should fail to claim if not operator", async function () {
      const earnings = ethers.parseEther("100");
      await token.transfer(await registry.getAddress(), earnings);
      await registry.addEarnings(0, earnings);

      await expect(
        registry.connect(operator2).claimEarnings(0)
      ).to.be.revertedWithCustomError(registry, "NotOperator");
    });

    it("Should fail to claim with no earnings", async function () {
      await expect(
        registry.connect(operator1).claimEarnings(0)
      ).to.be.revertedWithCustomError(registry, "NoEarnings");
    });

    it("Should prevent reentrancy on claim", async function () {
      const earnings = ethers.parseEther("100");
      await token.transfer(await registry.getAddress(), earnings);
      await registry.addEarnings(0, earnings);

      await registry.connect(operator1).claimEarnings(0);
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause", async function () {
      await registry.pause();
      
      await token.connect(operator1).approve(await registry.getAddress(), REGISTRATION_FEE);
      await expect(
        registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");

      await registry.unpause();
      
      await expect(
        registry.connect(operator1).registerNode("https://node1.example.com", "us-east-1", "ipfs://test", ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should only allow owner to pause", async function () {
      await expect(
        registry.connect(operator1).pause()
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Registration Fee Management", function () {
    it("Should allow owner to update registration fee", async function () {
      const newFee = ethers.parseEther("200");
      
      await expect(registry.setRegistrationFee(newFee))
        .to.emit(registry, "RegistrationFeeUpdated")
        .withArgs(newFee);

      expect(await registry.registrationFee()).to.equal(newFee);
    });

    it("Should not allow non-owner to update fee", async function () {
      await expect(
        registry.connect(operator1).setRegistrationFee(ethers.parseEther("200"))
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Getters", function () {
    it("Should fail to get invalid node", async function () {
      await expect(registry.getNode(999)).to.be.revertedWithCustomError(registry, "InvalidNode");
    });

    it("Should return empty array for operator with no nodes", async function () {
      const nodes = await registry.getOperatorNodes(operator2.address);
      expect(nodes.length).to.equal(0);
    });
  });
});
