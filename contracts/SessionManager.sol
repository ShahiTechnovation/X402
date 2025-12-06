// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./NodeRegistry.sol";

contract SessionManager is Ownable, ReentrancyGuard, Pausable {
    struct Session {
        address user;
        uint256 nodeId;
        uint256 rate;
        uint256 maxSpend;
        uint256 deposited;
        uint256 settled;
        uint256 startTime;
        uint256 lastSettleTime;
        bool active;
    }

    IERC20 public token;
    NodeRegistry public nodeRegistry;
    address public feeRecipient;
    uint256 public protocolFeePercent;
    uint256 public totalProtocolFees;

    mapping(bytes32 => Session) public sessions;
    mapping(address => bytes32[]) public userSessions;
    mapping(uint256 => bytes32[]) public nodeSessions;

    event SessionStarted(
        bytes32 indexed sessionId,
        address indexed user,
        uint256 indexed nodeId,
        uint256 rate,
        uint256 maxSpend,
        uint256 deposited
    );
    event SessionSettled(
        bytes32 indexed sessionId,
        uint256 elapsed,
        uint256 cost,
        uint256 protocolFee,
        uint256 nodeEarning
    );
    event SessionStopped(bytes32 indexed sessionId, uint256 refund);
    event FeeRecipientUpdated(address indexed newRecipient);
    event ProtocolFeeUpdated(uint256 newFeePercent);
    event ProtocolFeesWithdrawn(address indexed recipient, uint256 amount);

    constructor(
        address _token,
        address _nodeRegistry,
        address _feeRecipient,
        uint256 _protocolFeePercent
    ) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token");
        require(_nodeRegistry != address(0), "Invalid registry");
        require(_feeRecipient != address(0), "Invalid recipient");
        require(_protocolFeePercent <= 10000, "Fee too high");

        token = IERC20(_token);
        nodeRegistry = NodeRegistry(_nodeRegistry);
        feeRecipient = _feeRecipient;
        protocolFeePercent = _protocolFeePercent;
    }

    function startSession(
        uint256 nodeId,
        uint256 maxSpend,
        uint256 depositAmount
    ) external whenNotPaused nonReentrant returns (bytes32) {
        require(depositAmount > 0, "Deposit required");
        require(maxSpend >= depositAmount, "maxSpend < deposit");

        (, , uint256 rate, , bool active, ) = nodeRegistry.getNode(nodeId);
        require(active, "Node inactive");
        require(rate > 0, "Invalid rate");

        bytes32 sessionId = keccak256(
            abi.encodePacked(msg.sender, nodeId, block.timestamp, block.number)
        );
        require(sessions[sessionId].startTime == 0, "Session exists");

        require(
            token.transferFrom(msg.sender, address(this), depositAmount),
            "Deposit failed"
        );

        sessions[sessionId] = Session({
            user: msg.sender,
            nodeId: nodeId,
            rate: rate,
            maxSpend: maxSpend,
            deposited: depositAmount,
            settled: 0,
            startTime: block.timestamp,
            lastSettleTime: block.timestamp,
            active: true
        });

        userSessions[msg.sender].push(sessionId);
        nodeSessions[nodeId].push(sessionId);

        emit SessionStarted(sessionId, msg.sender, nodeId, rate, maxSpend, depositAmount);
        return sessionId;
    }

    function settleSession(bytes32 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];
        require(session.active, "Session inactive");
        require(block.timestamp > session.lastSettleTime, "Too soon");

        uint256 elapsed = block.timestamp - session.lastSettleTime;
        uint256 cost = (session.rate * elapsed) / 1 hours;

        uint256 available = session.deposited - session.settled;

        if (cost > available) {
            cost = available;
        }

        if (session.settled + cost > session.maxSpend) {
            cost = session.maxSpend - session.settled;
            session.active = false;
        }

        if (cost == 0) {
            session.active = false;
            emit SessionStopped(sessionId, 0);
            return;
        }

        uint256 protocolFee = (cost * protocolFeePercent) / 10000;
        uint256 nodeEarning = cost - protocolFee;

        session.settled += cost;
        session.lastSettleTime = block.timestamp;

        totalProtocolFees += protocolFee;
        
        require(token.transfer(address(nodeRegistry), nodeEarning), "Transfer to registry failed");
        nodeRegistry.addEarnings(session.nodeId, nodeEarning);

        if (session.settled >= available) {
            session.active = false;
        }

        emit SessionSettled(sessionId, elapsed, cost, protocolFee, nodeEarning);
    }

    function stopSession(bytes32 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];
        require(session.active, "Session inactive");
        require(
            msg.sender == session.user || msg.sender == owner(),
            "Not authorized"
        );

        if (block.timestamp > session.lastSettleTime) {
            uint256 elapsed = block.timestamp - session.lastSettleTime;
            uint256 cost = (session.rate * elapsed) / 1 hours;
            uint256 available = session.deposited - session.settled;

            if (cost > available) {
                cost = available;
            }

            if (session.settled + cost > session.maxSpend) {
                cost = session.maxSpend - session.settled;
            }

            if (cost > 0) {
                uint256 protocolFee = (cost * protocolFeePercent) / 10000;
                uint256 nodeEarning = cost - protocolFee;

                session.settled += cost;
                totalProtocolFees += protocolFee;
                
                require(token.transfer(address(nodeRegistry), nodeEarning), "Transfer to registry failed");
                nodeRegistry.addEarnings(session.nodeId, nodeEarning);

                emit SessionSettled(sessionId, elapsed, cost, protocolFee, nodeEarning);
            }
        }

        session.active = false;

        uint256 refund = session.deposited - session.settled;
        if (refund > 0) {
            require(token.transfer(session.user, refund), "Refund failed");
        }

        emit SessionStopped(sessionId, refund);
    }

    function forceStopSession(bytes32 sessionId) external onlyOwner nonReentrant {
        Session storage session = sessions[sessionId];
        require(session.active, "Session inactive");

        if (block.timestamp > session.lastSettleTime) {
            uint256 elapsed = block.timestamp - session.lastSettleTime;
            uint256 cost = (session.rate * elapsed) / 1 hours;
            uint256 available = session.deposited - session.settled;

            if (cost > available) {
                cost = available;
            }

            if (session.settled + cost > session.maxSpend) {
                cost = session.maxSpend - session.settled;
            }

            if (cost > 0) {
                uint256 protocolFee = (cost * protocolFeePercent) / 10000;
                uint256 nodeEarning = cost - protocolFee;

                session.settled += cost;
                totalProtocolFees += protocolFee;
                
                require(token.transfer(address(nodeRegistry), nodeEarning), "Transfer to registry failed");
                nodeRegistry.addEarnings(session.nodeId, nodeEarning);

                emit SessionSettled(sessionId, elapsed, cost, protocolFee, nodeEarning);
            }
        }

        session.active = false;

        uint256 refund = session.deposited - session.settled;
        if (refund > 0) {
            require(token.transfer(session.user, refund), "Refund failed");
        }

        emit SessionStopped(sessionId, refund);
    }

    function getSession(bytes32 sessionId) external view returns (
        address user,
        uint256 nodeId,
        uint256 rate,
        uint256 maxSpend,
        uint256 deposited,
        uint256 settled,
        uint256 startTime,
        uint256 lastSettleTime,
        bool active
    ) {
        Session memory session = sessions[sessionId];
        return (
            session.user,
            session.nodeId,
            session.rate,
            session.maxSpend,
            session.deposited,
            session.settled,
            session.startTime,
            session.lastSettleTime,
            session.active
        );
    }

    function getUserSessions(address user) external view returns (bytes32[] memory) {
        return userSessions[user];
    }

    function getNodeSessions(uint256 nodeId) external view returns (bytes32[] memory) {
        return nodeSessions[nodeId];
    }

    function withdrawProtocolFees() external onlyOwner nonReentrant {
        require(totalProtocolFees > 0, "No fees");
        uint256 amount = totalProtocolFees;
        totalProtocolFees = 0;

        require(token.transfer(feeRecipient, amount), "Transfer failed");

        emit ProtocolFeesWithdrawn(feeRecipient, amount);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setProtocolFeePercent(uint256 _protocolFeePercent) external onlyOwner {
        require(_protocolFeePercent <= 10000, "Fee too high");
        protocolFeePercent = _protocolFeePercent;
        emit ProtocolFeeUpdated(_protocolFeePercent);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
