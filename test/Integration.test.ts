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
  const PROTOCOL_FEE_PERCENT = 500;
  const NODE_RATE = ethers.parseEther("10");

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
      PROTOCOL_FEE_PERCENT
    );
    await sessionManager.waitForDeployment();

    await token.transfer(operator.address, ethers.parseEther("10000"));
    await token.transfer(user.address, ethers.parseEther("10000"));
  });

  describe("Complete User Journey", function () {
    it("Should complete full lifecycle: register node → start session → settle → claim earnings", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const operatorBalance1 = await token.balanceOf(operator.address);
      console.log("  Operator balance after registration:", ethers.formatEther(operatorBalance1));

      const depositAmount = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      console.log("  Session started with ID:", sessionId);

      const userBalance1 = await token.balanceOf(user.address);
      console.log("  User balance after deposit:", ethers.formatEther(userBalance1));

      await time.increase(3600);
      await sessionManager.settleSession(sessionId);

      const session1 = await sessionManager.getSession(sessionId);
      console.log("  Settled amount:", ethers.formatEther(session1.settled));

      await time.increase(3600);
      await sessionManager.connect(user).stopSession(sessionId);

      const userBalance2 = await token.balanceOf(user.address);
      console.log("  User balance after stop:", ethers.formatEther(userBalance2));

      const refund = userBalance2 - userBalance1;
      console.log("  Refund amount:", ethers.formatEther(refund));

      const node = await registry.getNode(0);
      console.log("  Node earnings:", ethers.formatEther(node.earnings));

      expect(node.earnings).to.be.greaterThan(0);

      const operatorBalance2 = await token.balanceOf(operator.address);
      await registry.connect(operator).claimEarnings(0);
      const operatorBalance3 = await token.balanceOf(operator.address);

      const claimed = operatorBalance3 - operatorBalance2;
      console.log("  Operator claimed:", ethers.formatEther(claimed));

      expect(claimed).to.equal(node.earnings);

      const totalFees = await sessionManager.totalProtocolFees();
      console.log("  Protocol fees accumulated:", ethers.formatEther(totalFees));

      const treasuryBalance1 = await token.balanceOf(treasury.address);
      await sessionManager.withdrawProtocolFees();
      const treasuryBalance2 = await token.balanceOf(treasury.address);

      const feesWithdrawn = treasuryBalance2 - treasuryBalance1;
      console.log("  Protocol fees withdrawn:", ethers.formatEther(feesWithdrawn));

      expect(feesWithdrawn).to.equal(totalFees);
    });

    it("Should handle multiple concurrent sessions", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const sessionIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        const depositAmount = ethers.parseEther("50");
        await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
        const tx = await sessionManager.connect(user).startSession(0, depositAmount, depositAmount);
        const receipt = await tx.wait();

        for (const log of receipt!.logs) {
          try {
            const parsed = sessionManager.interface.parseLog(log as any);
            if (parsed?.name === "SessionStarted") {
              sessionIds.push(parsed.args[0]);
              break;
            }
          } catch {}
        }
      }

      console.log("  Started", sessionIds.length, "concurrent sessions");

      await time.increase(1800);

      for (const sessionId of sessionIds) {
        await sessionManager.settleSession(sessionId);
      }

      console.log("  Settled all sessions");

      await time.increase(1800);

      for (const sessionId of sessionIds) {
        await sessionManager.connect(user).stopSession(sessionId);
      }

      console.log("  Stopped all sessions");

      const node = await registry.getNode(0);
      console.log("  Total node earnings:", ethers.formatEther(node.earnings));

      expect(node.earnings).to.be.greaterThan(0);

      await registry.connect(operator).claimEarnings(0);
      const finalNode = await registry.getNode(0);
      expect(finalNode.earnings).to.equal(0);
    });

    it("Should handle node deactivation gracefully", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      console.log("  Session started");

      await time.increase(1800);
      await sessionManager.settleSession(sessionId);

      console.log("  Session settled");

      await registry.connect(operator).deactivateNode(0);
      console.log("  Node deactivated");

      await time.increase(1800);
      await sessionManager.connect(user).stopSession(sessionId);

      console.log("  Session stopped successfully");

      const node = await registry.getNode(0);
      expect(node.active).to.be.false;
      expect(node.earnings).to.be.greaterThan(0);

      await registry.connect(operator).reactivateNode(0);
      console.log("  Node reactivated");

      const reactivatedNode = await registry.getNode(0);
      expect(reactivatedNode.active).to.be.true;

      const depositAmount2 = ethers.parseEther("50");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount2);
      await sessionManager.connect(user).startSession(0, depositAmount2, depositAmount2);

      console.log("  New session started after reactivation");
    });
  });

  describe("Protocol Economics", function () {
    it("Should correctly distribute fees across multiple sessions", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const sessions = 5;
      const depositPerSession = ethers.parseEther("20");

      for (let i = 0; i < sessions; i++) {
        await token.connect(user).approve(await sessionManager.getAddress(), depositPerSession);
        const tx = await sessionManager.connect(user).startSession(0, depositPerSession, depositPerSession);
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

        await time.increase(1800);
        await sessionManager.connect(user).stopSession(sessionId);
      }

      const node = await registry.getNode(0);
      const protocolFees = await sessionManager.totalProtocolFees();

      console.log("  Node earnings:", ethers.formatEther(node.earnings));
      console.log("  Protocol fees:", ethers.formatEther(protocolFees));

      const totalRevenue = node.earnings + protocolFees;
      console.log("  Total revenue:", ethers.formatEther(totalRevenue));

      const expectedFeeRatio = PROTOCOL_FEE_PERCENT / 10000;
      const actualFeeRatio = Number(protocolFees) / Number(totalRevenue);

      console.log("  Expected fee ratio:", expectedFeeRatio);
      console.log("  Actual fee ratio:", actualFeeRatio);

      expect(Math.abs(actualFeeRatio - expectedFeeRatio)).to.be.lessThan(0.001);
    });

    it("Should handle high-frequency settlement", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      const settlements = 10;
      for (let i = 0; i < settlements; i++) {
        await time.increase(600);
        await sessionManager.settleSession(sessionId);
      }

      console.log("  Performed", settlements, "settlements");

      const session = await sessionManager.getSession(sessionId);
      console.log("  Total settled:", ethers.formatEther(session.settled));

      expect(session.settled).to.be.greaterThan(0);
      expect(session.settled).to.be.lessThanOrEqual(depositAmount);
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should prevent unauthorized access to admin functions", async function () {
      await expect(
        sessionManager.connect(user).pause()
      ).to.be.revertedWithCustomError(sessionManager, "OwnableUnauthorizedAccount");

      await expect(
        registry.connect(user).pause()
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await expect(
        token.connect(user).mint(user.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Should handle emergency pause correctly", async function () {
      await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
      await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);

      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      await sessionManager.pause();
      console.log("  SessionManager paused");

      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await expect(
        sessionManager.connect(user).startSession(0, depositAmount, depositAmount)
      ).to.be.revertedWithCustomError(sessionManager, "EnforcedPause");

      await time.increase(1800);
      await sessionManager.connect(user).stopSession(sessionId);

      console.log("  Existing session stopped during pause");

      await sessionManager.unpause();
      console.log("  SessionManager unpaused");

      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).startSession(0, depositAmount, depositAmount);

      console.log("  New session started after unpause");
    });
  });
});
