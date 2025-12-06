import { expect } from "chai";
import { ethers } from "hardhat";
import { X402Token, NodeRegistry, SessionManager } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SessionManager", function () {
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

  let nodeId: number;

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

    await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
    await registry.connect(operator).registerNode(
      "https://node1.example.com",
      "us-east-1",
      "ipfs://test",
      NODE_RATE_PER_MINUTE
    );
    nodeId = 0;
  });

  describe("Deployment", function () {
    it("Should set correct addresses and parameters", async function () {
      expect(await sessionManager.token()).to.equal(await token.getAddress());
      expect(await sessionManager.nodeRegistry()).to.equal(await registry.getAddress());
      expect(await sessionManager.treasury()).to.equal(treasury.address);
      expect(await sessionManager.protocolFeeBps()).to.equal(PROTOCOL_FEE_BPS);
    });

    it("Should revert with invalid addresses", async function () {
      const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
      
      await expect(
        SessionManagerFactory.deploy(
          ethers.ZeroAddress,
          await registry.getAddress(),
          treasury.address,
          PROTOCOL_FEE_BPS
        )
      ).to.be.revertedWithCustomError(sessionManager, "InvalidToken");

      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          ethers.ZeroAddress,
          treasury.address,
          PROTOCOL_FEE_BPS
        )
      ).to.be.revertedWithCustomError(sessionManager, "InvalidRegistry");

      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          await registry.getAddress(),
          ethers.ZeroAddress,
          PROTOCOL_FEE_BPS
        )
      ).to.be.revertedWithCustomError(sessionManager, "InvalidTreasury");
    });

    it("Should revert with fee too high", async function () {
      const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
      
      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          await registry.getAddress(),
          treasury.address,
          10001
        )
      ).to.be.revertedWithCustomError(sessionManager, "InvalidFeeBps");
    });
  });

  describe("Deposit and Withdraw", function () {
    it("Should deposit tokens successfully", async function () {
      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);

      await expect(sessionManager.connect(user).deposit(depositAmount))
        .to.emit(sessionManager, "Deposited")
        .withArgs(user.address, depositAmount);

      expect(await sessionManager.getUserBalance(user.address)).to.equal(depositAmount);
    });

    it("Should withdraw tokens successfully", async function () {
      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);

      const balanceBefore = await token.balanceOf(user.address);
      
      await expect(sessionManager.connect(user).withdraw(depositAmount))
        .to.emit(sessionManager, "Withdrawn")
        .withArgs(user.address, depositAmount);

      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(balanceBefore + depositAmount);
      expect(await sessionManager.getUserBalance(user.address)).to.equal(0);
    });

    it("Should revert deposit with zero amount", async function () {
      await expect(
        sessionManager.connect(user).deposit(0)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidAmount");
    });

    it("Should revert withdraw with zero amount", async function () {
      await expect(
        sessionManager.connect(user).withdraw(0)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidAmount");
    });

    it("Should revert withdraw with insufficient balance", async function () {
      await expect(
        sessionManager.connect(user).withdraw(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "InsufficientBalance");
    });
  });

  describe("Session Lifecycle - Happy Path", function () {
    const depositAmount = ethers.parseEther("100");
    const maxSpend = ethers.parseEther("100");

    beforeEach(async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);
    });

    it("Should start a session successfully", async function () {
      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, depositAmount);
      const receipt = await tx.wait();

      const events = receipt?.logs.filter((log: any) => {
        try {
          return sessionManager.interface.parseLog(log)?.name === "SessionStarted";
        } catch {
          return false;
        }
      });

      expect(events?.length).to.be.greaterThan(0);
      expect(await sessionManager.getUserBalance(user.address)).to.equal(0);
    });

    it("Should settle a session", async function () {
      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, depositAmount);
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

      await expect(sessionManager.settle(sessionId))
        .to.emit(sessionManager, "SessionSettled");

      const session = await sessionManager.getSessionStatus(sessionId);
      expect(session.settled).to.be.greaterThan(0);
    });

    it("Should stop a session and refund remaining balance", async function () {
      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, depositAmount);
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

      const userBalanceBefore = await token.balanceOf(user.address);
      await sessionManager.connect(user).stopSession(sessionId);
      const userBalanceAfter = await token.balanceOf(user.address);

      expect(userBalanceAfter).to.be.greaterThan(userBalanceBefore);

      const session = await sessionManager.getSessionStatus(sessionId);
      expect(session.active).to.be.false;
    });

    it("Should handle multiple settle calls", async function () {
      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, depositAmount);
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

      const session1 = await sessionManager.getSessionStatus(sessionId);
      const settled1 = session1.settled;

      await time.increase(60);
      await sessionManager.settle(sessionId);

      const session2 = await sessionManager.getSessionStatus(sessionId);
      expect(session2.settled).to.be.greaterThan(settled1);
    });
  });

  describe("Session Validation", function () {
    beforeEach(async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).deposit(ethers.parseEther("100"));
    });

    it("Should revert if node is inactive", async function () {
      await registry.connect(operator).deactivateNode(nodeId);

      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "NodeInactive");
    });

    it("Should revert if deposit is zero", async function () {
      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), 0)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidAmount");
    });

    it("Should revert if maxSpend is less than deposit", async function () {
      const deposit = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("50");

      await expect(
        sessionManager.connect(user).startSession(nodeId, maxSpend, deposit)
      ).to.be.revertedWithCustomError(sessionManager, "MaxSpendTooLow");
    });

    it("Should revert if insufficient user balance", async function () {
      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("200"), ethers.parseEther("200"))
      ).to.be.revertedWithCustomError(sessionManager, "InsufficientBalance");
    });

    it("Should revert settle if session not active", async function () {
      const tx = await sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"));
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
      await sessionManager.connect(user).stopSession(sessionId);

      await expect(
        sessionManager.settle(sessionId)
      ).to.be.revertedWithCustomError(sessionManager, "SessionInactive");
    });
  });

  describe("Insufficient Balance Mid-Session", function () {
    it("Should handle partial settlement when balance runs out", async function () {
      const smallDeposit = ethers.parseEther("5");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), smallDeposit);
      await sessionManager.connect(user).deposit(smallDeposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, smallDeposit);
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
      expect(session.settled).to.equal(smallDeposit);
      expect(session.active).to.be.false;
    });
  });

  describe("MaxSpend Enforcement", function () {
    it("Should stop session when maxSpend is reached", async function () {
      const deposit = ethers.parseEther("10");
      const maxSpend = ethers.parseEther("10");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, deposit);
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
      expect(session.settled).to.equal(maxSpend);
      expect(session.active).to.be.false;
    });
  });

  describe("Protocol Fee Accrual", function () {
    it("Should accrue protocol fees correctly", async function () {
      const deposit = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, maxSpend, deposit);
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
    });

    it("Should allow owner to withdraw protocol fees", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, deposit, deposit);
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

      const balanceBefore = await token.balanceOf(treasury.address);
      await sessionManager.withdrawProtocolFees();
      const balanceAfter = await token.balanceOf(treasury.address);

      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it("Should not allow non-owner to withdraw fees", async function () {
      await expect(
        sessionManager.connect(user).withdrawProtocolFees()
      ).to.be.revertedWithCustomError(sessionManager, "OwnableUnauthorizedAccount");
    });
  });

  describe("Node Earnings Claims", function () {
    it("Should credit node earnings correctly", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, deposit, deposit);
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

      const earnings = await sessionManager.getNodeEarnings(nodeId);
      expect(earnings).to.be.greaterThan(0);
    });

    it("Should allow node operator to claim earnings", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, deposit, deposit);
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

      const balanceBefore = await token.balanceOf(operator.address);
      await registry.connect(operator).claimEarnings(nodeId);
      const balanceAfter = await token.balanceOf(operator.address);

      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });
  });

  describe("View Functions", function () {
    it("Should get user balance", async function () {
      const depositAmount = ethers.parseEther("100");
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
      await sessionManager.connect(user).deposit(depositAmount);

      expect(await sessionManager.getUserBalance(user.address)).to.equal(depositAmount);
    });

    it("Should get node earnings", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, deposit, deposit);
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

      const earnings = await sessionManager.getNodeEarnings(nodeId);
      expect(earnings).to.be.greaterThan(0);
    });

    it("Should get session status", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await sessionManager.connect(user).deposit(deposit);

      const tx = await sessionManager.connect(user).startSession(nodeId, deposit, deposit);
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

      const session = await sessionManager.getSessionStatus(sessionId);
      expect(session.user).to.equal(user.address);
      expect(session.nodeId).to.equal(nodeId);
      expect(session.active).to.be.true;
    });

    it("Should revert on invalid session", async function () {
      const fakeSessionId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        sessionManager.getSessionStatus(fakeSessionId)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidSession");
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause", async function () {
      await sessionManager.pause();
      
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await expect(
        sessionManager.connect(user).deposit(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "EnforcedPause");

      await sessionManager.unpause();
      
      await expect(
        sessionManager.connect(user).deposit(ethers.parseEther("100"))
      ).to.not.be.reverted;
    });

    it("Should only allow owner to pause", async function () {
      await expect(
        sessionManager.connect(user).pause()
      ).to.be.revertedWithCustomError(sessionManager, "OwnableUnauthorizedAccount");
    });
  });

  describe("Admin Functions", function () {
    it("Should update treasury address", async function () {
      const newTreasury = user.address;
      await expect(sessionManager.setTreasury(newTreasury))
        .to.emit(sessionManager, "TreasuryUpdated")
        .withArgs(newTreasury);

      expect(await sessionManager.treasury()).to.equal(newTreasury);
    });

    it("Should not allow setting zero address as treasury", async function () {
      await expect(
        sessionManager.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidTreasury");
    });

    it("Should update protocol fee bps", async function () {
      const newFeeBps = 1000;
      await expect(sessionManager.setProtocolFeeBps(newFeeBps))
        .to.emit(sessionManager, "ProtocolFeeBpsUpdated")
        .withArgs(newFeeBps);

      expect(await sessionManager.protocolFeeBps()).to.equal(newFeeBps);
    });

    it("Should not allow protocol fee bps over 10000", async function () {
      await expect(
        sessionManager.setProtocolFeeBps(10001)
      ).to.be.revertedWithCustomError(sessionManager, "InvalidFeeBps");
    });
  });
});
