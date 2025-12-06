import { expect } from "chai";
import { ethers } from "hardhat";
import { X402Token, NodeRegistry, SessionManager } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Integration Tests - Full Flow", function () {
  let token: X402Token;
  let registry: NodeRegistry;
  let sessionManager: SessionManager;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REGISTRATION_FEE = ethers.parseEther("10");
  const PROTOCOL_FEE_BPS = 500;
  const NODE_RATE_PER_MINUTE = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, operator, user, treasury] = await ethers.getSigners();

    const X402TokenFactory = await ethers.getContractFactory("X402Token");
    token = await X402TokenFactory.deploy("X402 Token", "X402", INITIAL_SUPPLY);
    await token.waitForDeployment();

    const NodeRegistryFactory = await ethers.getContractFactory("NodeRegistry");
    registry = await NodeRegistryFactory.deploy(await token.getAddress(), REGISTRATION_FEE);
    await registry.waitForDeployment();

    const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
    sessionManager = await SessionManagerFactory.deploy(
      await token.getAddress(),
      await registry.getAddress(),
      treasury.address,
      PROTOCOL_FEE_BPS
    );
    await sessionManager.waitForDeployment();

    await token.transfer(operator.address, ethers.parseEther("10000"));
    await token.transfer(user.address, ethers.parseEther("10000"));
  });

  describe("Complete User Journey", function () {
    it("Should complete full lifecycle: register node → deposit → start session → settle → stop → claim earnings", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode(
        "https://node1.example.com",
        "us-east-1",
        "ipfs://test",
        NODE_RATE_PER_MINUTE
      );

      const operatorBalance1 = await token.balanceOf(operator.address);

      const depositAmount = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);

      const userBalance0 = await sessionManager.getUserBalance(user.address);
      expect(userBalance0).to.equal(depositAmount);

      const tx = await sessionManager.connect(user).startSession(0, maxSpend, depositAmount);
      const receipt = await tx.wait();

      let sessionId: string = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId = parsed.args[0];
            break;
          }
        } catch {}
      }

      expect(await sessionManager.getUserBalance(user.address)).to.equal(0);

      const userTokenBalance1 = await token.balanceOf(user.address);

      await time.increase(60);
      await sessionManager.settle(sessionId);

      const session1 = await sessionManager.getSessionStatus(sessionId);
      expect(session1.settled).to.be.greaterThan(0);

      await time.increase(60);
      await sessionManager.connect(user).stopSession(sessionId);

      const userTokenBalance2 = await token.balanceOf(user.address);
      const refund = userTokenBalance2 - userTokenBalance1;
      expect(refund).to.be.greaterThan(0);

      const earnings = await sessionManager.getNodeEarnings(0);
      expect(earnings).to.be.greaterThan(0);

      const operatorBalance2 = await token.balanceOf(operator.address);
      await registry.connect(operator).claimEarnings(0);
      const operatorBalance3 = await token.balanceOf(operator.address);

      const claimed = operatorBalance3 - operatorBalance2;
      expect(claimed).to.equal(earnings);
    });

    it("Should handle protocol fee collection", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode(
        "https://node1.example.com",
        "us-east-1",
        "ipfs://test",
        NODE_RATE_PER_MINUTE
      );

      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);

      const tx = await sessionManager.connect(user).startSession(0, depositAmount, depositAmount);
      const receipt = await tx.wait();

      let sessionId: string = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId = parsed.args[0];
            break;
          }
        } catch {}
      }

      await time.increase(60);
      await sessionManager.settle(sessionId);

      const totalFees = await sessionManager.totalProtocolFees();
      expect(totalFees).to.be.greaterThan(0);

      const treasuryBalance1 = await token.balanceOf(treasury.address);
      await sessionManager.withdrawProtocolFees();
      const treasuryBalance2 = await token.balanceOf(treasury.address);

      expect(treasuryBalance2 - treasuryBalance1).to.equal(totalFees);
    });

    it("Should handle multiple nodes and sessions", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE * 2n);
      await registry.connect(operator).registerNode(
        "https://node1.example.com",
        "us-east-1",
        "ipfs://test1",
        NODE_RATE_PER_MINUTE
      );
      await registry.connect(operator).registerNode(
        "https://node2.example.com",
        "us-west-1",
        "ipfs://test2",
        NODE_RATE_PER_MINUTE * 2n
      );

      const depositAmount = ethers.parseEther("200");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);

      const tx1 = await sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"));
      const receipt1 = await tx1.wait();

      let sessionId1: string = "";
      for (const log of receipt1!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId1 = parsed.args[0];
            break;
          }
        } catch {}
      }

      const tx2 = await sessionManager.connect(user).startSession(1, ethers.parseEther("100"), ethers.parseEther("100"));
      const receipt2 = await tx2.wait();

      let sessionId2: string = "";
      for (const log of receipt2!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId2 = parsed.args[0];
            break;
          }
        } catch {}
      }

      await time.increase(60);
      
      await sessionManager.settle(sessionId1);
      await sessionManager.settle(sessionId2);

      const earnings1 = await sessionManager.getNodeEarnings(0);
      const earnings2 = await sessionManager.getNodeEarnings(1);

      expect(earnings1).to.be.greaterThan(0);
      expect(earnings2).to.be.greaterThan(0);
      expect(earnings2).to.be.greaterThan(earnings1);
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    beforeEach(async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode(
        "https://node1.example.com",
        "us-east-1",
        "ipfs://test",
        NODE_RATE_PER_MINUTE
      );
    });

    it("Should prevent session start with insufficient balance", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("50"));
      await sessionManager.connect(user).deposit(ethers.parseEther("50"));

      await expect(
        sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "InsufficientBalance");
    });

    it("Should handle session that runs out of funds", async function () {
      const smallDeposit = ethers.parseEther("5");
      await token.connect(user).approve(await sessionManager.getAddress(), smallDeposit);
      await sessionManager.connect(user).deposit(smallDeposit);

      const tx = await sessionManager.connect(user).startSession(0, ethers.parseEther("100"), smallDeposit);
      const receipt = await tx.wait();

      let sessionId: string = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId = parsed.args[0];
            break;
          }
        } catch {}
      }

      await time.increase(600);
      await sessionManager.settle(sessionId);

      const session = await sessionManager.getSessionStatus(sessionId);
      expect(session.active).to.be.false;
      expect(session.settled).to.equal(smallDeposit);
    });

    it("Should prevent starting session with inactive node", async function () {
      await registry.connect(operator).deactivateNode(0);

      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));

      await expect(
        sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "NodeInactive");
    });

    it("Should allow reactivating node and starting new sessions", async function () {
      await registry.connect(operator).deactivateNode(0);
      await registry.connect(operator).reactivateNode(0);

      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));

      await expect(
        sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.not.be.reverted;
    });
  });

  describe("Multi-User Scenarios", function () {
    let user2: SignerWithAddress;

    beforeEach(async function () {
      [, , , , user2] = await ethers.getSigners();
      await token.transfer(user2.address, ethers.parseEther("10000"));

      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode(
        "https://node1.example.com",
        "us-east-1",
        "ipfs://test",
        NODE_RATE_PER_MINUTE
      );
    });

    it("Should handle concurrent sessions from different users", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));

      await token.connect(user2).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user2).deposit(ethers.parseEther("100"));

      const tx1 = await sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"));
      const tx2 = await sessionManager.connect(user2).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"));

      const receipt1 = await tx1.wait();
      const receipt2 = await tx2.wait();

      let sessionId1: string = "";
      for (const log of receipt1!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId1 = parsed.args[0];
            break;
          }
        } catch {}
      }

      let sessionId2: string = "";
      for (const log of receipt2!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId2 = parsed.args[0];
            break;
          }
        } catch {}
      }

      await time.increase(60);

      await sessionManager.settle(sessionId1);
      await sessionManager.settle(sessionId2);

      const session1 = await sessionManager.getSessionStatus(sessionId1);
      const session2 = await sessionManager.getSessionStatus(sessionId2);

      expect(session1.settled).to.be.greaterThan(0);
      expect(session2.settled).to.be.greaterThan(0);
    });

    it("Should not allow user to stop another user's session", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));

      const tx = await sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"));
      const receipt = await tx.wait();

      let sessionId: string = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId = parsed.args[0];
            break;
          }
        } catch {}
      }

      await expect(
        sessionManager.connect(user2).stopSession(sessionId)
      ).to.be.revertedWithCustomError(sessionManager, "NotAuthorized");
    });

    it("Should allow owner to stop any session", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));

      const tx = await sessionManager.connect(user).startSession(0, ethers.parseEther("100"), ethers.parseEther("100"));
      const receipt = await tx.wait();

      let sessionId: string = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = sessionManager.interface.parseLog(log as any);
          if (parsed?.name === "SessionStarted") {
            sessionId = parsed.args[0];
            break;
          }
        } catch {}
      }

      await expect(
        sessionManager.connect(owner).stopSession(sessionId)
      ).to.not.be.reverted;
    });
  });
});
