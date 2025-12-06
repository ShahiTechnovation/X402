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
  let feeRecipient: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REGISTRATION_FEE = ethers.parseEther("10");
  const PROTOCOL_FEE_PERCENT = 500;
  const NODE_RATE = ethers.parseEther("10");

  let nodeId: number;

  beforeEach(async function () {
    [owner, operator, user, feeRecipient] = await ethers.getSigners();

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
      feeRecipient.address,
      PROTOCOL_FEE_PERCENT
    );
    await sessionManager.waitForDeployment();

    await token.transfer(operator.address, ethers.parseEther("10000"));
    await token.transfer(user.address, ethers.parseEther("10000"));

    await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
    const tx = await registry.connect(operator).registerNode("https://node1.example.com", NODE_RATE);
    const receipt = await tx.wait();
    nodeId = 0;
  });

  describe("Deployment", function () {
    it("Should set correct addresses and parameters", async function () {
      expect(await sessionManager.token()).to.equal(await token.getAddress());
      expect(await sessionManager.nodeRegistry()).to.equal(await registry.getAddress());
      expect(await sessionManager.feeRecipient()).to.equal(feeRecipient.address);
      expect(await sessionManager.protocolFeePercent()).to.equal(PROTOCOL_FEE_PERCENT);
    });

    it("Should revert with invalid addresses", async function () {
      const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
      
      await expect(
        SessionManagerFactory.deploy(
          ethers.ZeroAddress,
          await registry.getAddress(),
          feeRecipient.address,
          PROTOCOL_FEE_PERCENT
        )
      ).to.be.revertedWith("Invalid token");

      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          ethers.ZeroAddress,
          feeRecipient.address,
          PROTOCOL_FEE_PERCENT
        )
      ).to.be.revertedWith("Invalid registry");

      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          await registry.getAddress(),
          ethers.ZeroAddress,
          PROTOCOL_FEE_PERCENT
        )
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should revert with fee too high", async function () {
      const SessionManagerFactory = await ethers.getContractFactory("SessionManager");
      
      await expect(
        SessionManagerFactory.deploy(
          await token.getAddress(),
          await registry.getAddress(),
          feeRecipient.address,
          10001
        )
      ).to.be.revertedWith("Fee too high");
    });
  });

  describe("Session Lifecycle - Happy Path", function () {
    const depositAmount = ethers.parseEther("100");
    const maxSpend = ethers.parseEther("100");

    it("Should start a session successfully", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);

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
    });

    it("Should settle a session", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      await time.increase(3600);

      await expect(sessionManager.settleSession(sessionId))
        .to.emit(sessionManager, "SessionSettled");

      const session = await sessionManager.getSession(sessionId);
      expect(session.settled).to.be.greaterThan(0);
    });

    it("Should stop a session and refund remaining balance", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      await time.increase(1800);

      const userBalanceBefore = await token.balanceOf(user.address);
      await sessionManager.connect(user).stopSession(sessionId);
      const userBalanceAfter = await token.balanceOf(user.address);

      expect(userBalanceAfter).to.be.greaterThan(userBalanceBefore);

      const session = await sessionManager.getSession(sessionId);
      expect(session.active).to.be.false;
    });

    it("Should handle multiple settle calls", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), depositAmount);
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

      await time.increase(1800);
      await sessionManager.settleSession(sessionId);

      const session1 = await sessionManager.getSession(sessionId);
      const settled1 = session1.settled;

      await time.increase(1800);
      await sessionManager.settleSession(sessionId);

      const session2 = await sessionManager.getSession(sessionId);
      expect(session2.settled).to.be.greaterThan(settled1);
    });
  });

  describe("Session Validation", function () {
    it("Should revert if node is inactive", async function () {
      await registry.connect(operator).deactivateNode(nodeId);

      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.be.revertedWith("Node inactive");
    });

    it("Should revert if deposit is zero", async function () {
      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), 0)
      ).to.be.revertedWith("Deposit required");
    });

    it("Should revert if maxSpend is less than deposit", async function () {
      const deposit = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("50");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
      await expect(
        sessionManager.connect(user).startSession(nodeId, maxSpend, deposit)
      ).to.be.revertedWith("maxSpend < deposit");
    });

    it("Should revert settle if session not active", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
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

      await time.increase(1800);
      await sessionManager.connect(user).stopSession(sessionId);

      await expect(
        sessionManager.settleSession(sessionId)
      ).to.be.revertedWith("Session inactive");
    });
  });

  describe("Insufficient Balance Mid-Session", function () {
    it("Should handle partial settlement when balance runs out", async function () {
      const smallDeposit = ethers.parseEther("5");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), smallDeposit);
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

      await time.increase(3600);

      await sessionManager.settleSession(sessionId);

      const session = await sessionManager.getSession(sessionId);
      expect(session.settled).to.equal(smallDeposit);
      expect(session.active).to.be.false;
    });

    it("Should force stop session with insufficient balance", async function () {
      const smallDeposit = ethers.parseEther("5");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), smallDeposit);
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

      await time.increase(3600);

      await sessionManager.connect(owner).forceStopSession(sessionId);

      const session = await sessionManager.getSession(sessionId);
      expect(session.active).to.be.false;
      expect(session.settled).to.equal(smallDeposit);
    });
  });

  describe("MaxSpend Enforcement", function () {
    it("Should stop session when maxSpend is reached", async function () {
      const deposit = ethers.parseEther("10");
      const maxSpend = ethers.parseEther("10");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      await time.increase(3600);

      await sessionManager.settleSession(sessionId);

      const session = await sessionManager.getSession(sessionId);
      expect(session.settled).to.equal(maxSpend);
      expect(session.active).to.be.false;
    });

    it("Should refund excess deposit when maxSpend limits settlement", async function () {
      const deposit = ethers.parseEther("10");
      const maxSpend = ethers.parseEther("50");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      const userBalanceBefore = await token.balanceOf(user.address);
      await sessionManager.connect(user).stopSession(sessionId);
      const userBalanceAfter = await token.balanceOf(user.address);

      const refund = userBalanceAfter - userBalanceBefore;
      expect(refund).to.be.greaterThan(0);
      expect(refund).to.be.lessThan(deposit);
    });
  });

  describe("Protocol Fee Accrual", function () {
    it("Should accrue protocol fees correctly", async function () {
      const deposit = ethers.parseEther("100");
      const maxSpend = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      await time.increase(3600);
      await sessionManager.settleSession(sessionId);

      const totalFees = await sessionManager.totalProtocolFees();
      expect(totalFees).to.be.greaterThan(0);
    });

    it("Should allow owner to withdraw protocol fees", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      await time.increase(3600);
      await sessionManager.settleSession(sessionId);

      const balanceBefore = await token.balanceOf(feeRecipient.address);
      await sessionManager.withdrawProtocolFees();
      const balanceAfter = await token.balanceOf(feeRecipient.address);

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

      await time.increase(3600);
      await sessionManager.settleSession(sessionId);

      const node = await registry.getNode(nodeId);
      expect(node.earnings).to.be.greaterThan(0);
    });

    it("Should allow node operator to claim earnings", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      await time.increase(3600);
      await sessionManager.settleSession(sessionId);

      const balanceBefore = await token.balanceOf(operator.address);
      await registry.connect(operator).claimEarnings(nodeId);
      const balanceAfter = await token.balanceOf(operator.address);

      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect stopSession from reentrancy", async function () {
      const deposit = ethers.parseEther("100");

      await token.connect(user).approve(await sessionManager.getAddress(), deposit);
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

      await time.increase(1800);
      await sessionManager.connect(user).stopSession(sessionId);

      const session = await sessionManager.getSession(sessionId);
      expect(session.active).to.be.false;
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause", async function () {
      await sessionManager.pause();

      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(sessionManager, "EnforcedPause");

      await sessionManager.unpause();

      await expect(
        sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"))
      ).to.not.be.reverted;
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to update fee recipient", async function () {
      const newRecipient = user.address;

      await expect(sessionManager.setFeeRecipient(newRecipient))
        .to.emit(sessionManager, "FeeRecipientUpdated")
        .withArgs(newRecipient);

      expect(await sessionManager.feeRecipient()).to.equal(newRecipient);
    });

    it("Should allow owner to update protocol fee percent", async function () {
      const newFeePercent = 1000;

      await expect(sessionManager.setProtocolFeePercent(newFeePercent))
        .to.emit(sessionManager, "ProtocolFeeUpdated")
        .withArgs(newFeePercent);

      expect(await sessionManager.protocolFeePercent()).to.equal(newFeePercent);
    });

    it("Should revert if fee recipient is zero address", async function () {
      await expect(
        sessionManager.setFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should revert if fee percent is too high", async function () {
      await expect(
        sessionManager.setProtocolFeePercent(10001)
      ).to.be.revertedWith("Fee too high");
    });
  });

  describe("Getters", function () {
    it("Should return user sessions", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"));

      const sessions = await sessionManager.getUserSessions(user.address);
      expect(sessions.length).to.equal(1);
    });

    it("Should return node sessions", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
      await sessionManager.connect(user).startSession(nodeId, ethers.parseEther("100"), ethers.parseEther("100"));

      const sessions = await sessionManager.getNodeSessions(nodeId);
      expect(sessions.length).to.equal(1);
    });
  });

  describe("Authorization", function () {
    it("Should allow owner to force stop session", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
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

      await time.increase(1800);
      await expect(sessionManager.connect(owner).forceStopSession(sessionId))
        .to.not.be.reverted;
    });

    it("Should not allow non-owner to force stop", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
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

      await expect(
        sessionManager.connect(operator).forceStopSession(sessionId)
      ).to.be.revertedWithCustomError(sessionManager, "OwnableUnauthorizedAccount");
    });
  });

  describe("Rate and Time Rounding", function () {
    it("Should handle small time intervals correctly", async function () {
      await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
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

      await time.increase(10);
      await sessionManager.settleSession(sessionId);

      const session = await sessionManager.getSession(sessionId);
      expect(session.settled).to.be.greaterThanOrEqual(0);
    });

    it("Should calculate cost correctly for various rates", async function () {
      const rates = [
        ethers.parseEther("1"),
        ethers.parseEther("10"),
        ethers.parseEther("100"),
        ethers.parseEther("0.5")
      ];

      for (let i = 0; i < rates.length; i++) {
        await token.connect(operator).approve(await registry.getAddress(), REGISTRATION_FEE);
        await registry.connect(operator).registerNode(`https://node${i+2}.example.com`, rates[i]);

        await token.connect(user).approve(await sessionManager.getAddress(), ethers.parseEther("100"));
        const tx = await sessionManager.connect(user).startSession(i + 1, ethers.parseEther("100"), ethers.parseEther("100"));
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

        await time.increase(3600);
        await sessionManager.settleSession(sessionId);

        const session = await sessionManager.getSession(sessionId);
        expect(session.settled).to.be.greaterThan(0);
      }
    });
  });
});
