// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./NodeRegistry.sol";

/**
 * @title SessionManager
 * @notice Manages compute sessions between users and nodes in the X402 Protocol
 * @dev Handles deposits, withdrawals, session lifecycle, settlements, and fee distribution
 * Uses minute-based pricing with automatic settlement and protocol fee collection
 */
contract SessionManager is Ownable, ReentrancyGuard, Pausable {
    using SafeCast for uint256;

    /**
     * @notice Session metadata structure
     * @param user The address of the user
     * @param nodeId The ID of the compute node
     * @param ratePerMinute The rate snapshot at session start
     * @param maxSpend Maximum amount user willing to spend
     * @param deposited Amount deposited for this session
     * @param settled Amount already settled
     * @param startTime Session start timestamp
     * @param lastSettleTime Last settlement timestamp
     * @param protocolFeeBps Protocol fee in basis points at session start
     * @param active Whether the session is currently active
     */
    struct Session {
        address user;
        uint256 nodeId;
        uint256 ratePerMinute;
        uint256 maxSpend;
        uint256 deposited;
        uint256 settled;
        uint256 startTime;
        uint256 lastSettleTime;
        uint256 protocolFeeBps;
        bool active;
    }

    error InvalidToken();
    error InvalidRegistry();
    error InvalidTreasury();
    error InvalidFeeBps();
    error InvalidAmount();
    error InsufficientBalance();
    error MaxSpendTooLow();
    error NodeInactive();
    error InvalidRate();
    error SessionExists();
    error SessionInactive();
    error NotAuthorized();
    error NoProtocolFees();
    error TransferFailed();
    error DepositFailed();
    error InvalidSession();

    IERC20 public immutable token;
    NodeRegistry public immutable nodeRegistry;
    address public treasury;
    uint256 public protocolFeeBps;
    uint256 public totalProtocolFees;

    mapping(address => uint256) public userBalances;
    mapping(bytes32 => Session) public sessions;
    mapping(address => bytes32[]) public userSessions;
    mapping(uint256 => bytes32[]) public nodeSessions;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event SessionStarted(
        bytes32 indexed sessionId,
        address indexed user,
        uint256 indexed nodeId,
        uint256 ratePerMinute,
        uint256 maxSpend,
        uint256 deposited,
        uint256 protocolFeeBps
    );
    event SessionSettled(
        bytes32 indexed sessionId,
        uint256 elapsedMinutes,
        uint256 cost,
        uint256 protocolFee,
        uint256 nodeEarning
    );
    event SessionStopped(bytes32 indexed sessionId, uint256 refund);
    event TreasuryUpdated(address indexed newTreasury);
    event ProtocolFeeBpsUpdated(uint256 newFeeBps);
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);

    /**
     * @notice Constructs the SessionManager contract
     * @param _token The ERC20 token address for payments
     * @param _nodeRegistry The NodeRegistry contract address
     * @param _treasury The address to receive protocol fees
     * @param _protocolFeeBps The protocol fee in basis points (e.g., 500 = 5%)
     */
    constructor(
        address _token,
        address _nodeRegistry,
        address _treasury,
        uint256 _protocolFeeBps
    ) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidToken();
        if (_nodeRegistry == address(0)) revert InvalidRegistry();
        if (_treasury == address(0)) revert InvalidTreasury();
        if (_protocolFeeBps > 10000) revert InvalidFeeBps();

        token = IERC20(_token);
        nodeRegistry = NodeRegistry(_nodeRegistry);
        treasury = _treasury;
        protocolFeeBps = _protocolFeeBps;
    }

    /**
     * @notice Deposits tokens into the user's balance
     * @param amount The amount to deposit
     * @dev Tokens must be approved before calling
     */
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();

        if (!token.transferFrom(msg.sender, address(this), amount)) {
            revert DepositFailed();
        }

        userBalances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws tokens from the user's balance
     * @param amount The amount to withdraw
     * @dev Cannot withdraw funds reserved for active sessions
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (userBalances[msg.sender] < amount) revert InsufficientBalance();

        userBalances[msg.sender] -= amount;

        if (!token.transfer(msg.sender, amount)) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Starts a new compute session
     * @param nodeId The ID of the node to use
     * @param maxSpend Maximum amount willing to spend on this session
     * @param depositAmount Amount to reserve from user balance for this session
     * @return sessionId The unique identifier for the session
     * @dev Captures rate and protocol fee at session start for consistency
     */
    function startSession(
        uint256 nodeId,
        uint256 maxSpend,
        uint256 depositAmount
    ) external whenNotPaused nonReentrant returns (bytes32) {
        if (depositAmount == 0) revert InvalidAmount();
        if (maxSpend < depositAmount) revert MaxSpendTooLow();
        if (userBalances[msg.sender] < depositAmount) revert InsufficientBalance();

        (
            ,
            ,
            ,
            ,
            uint256 ratePerMinute,
            ,
            bool active,
        ) = nodeRegistry.getNode(nodeId);
        
        if (!active) revert NodeInactive();
        if (ratePerMinute == 0) revert InvalidRate();

        bytes32 sessionId = keccak256(
            abi.encodePacked(msg.sender, nodeId, block.timestamp, block.number)
        );
        if (sessions[sessionId].startTime != 0) revert SessionExists();

        userBalances[msg.sender] -= depositAmount;

        sessions[sessionId] = Session({
            user: msg.sender,
            nodeId: nodeId,
            ratePerMinute: ratePerMinute,
            maxSpend: maxSpend,
            deposited: depositAmount,
            settled: 0,
            startTime: block.timestamp,
            lastSettleTime: block.timestamp,
            protocolFeeBps: protocolFeeBps,
            active: true
        });

        userSessions[msg.sender].push(sessionId);
        nodeSessions[nodeId].push(sessionId);

        emit SessionStarted(
            sessionId,
            msg.sender,
            nodeId,
            ratePerMinute,
            maxSpend,
            depositAmount,
            protocolFeeBps
        );
        return sessionId;
    }

    /**
     * @notice Settles charges for an active session
     * @param sessionId The ID of the session to settle
     * @dev Computes elapsed minutes with ceiling logic, caps by balance/maxSpend
     * Splits protocol fee to treasury and accrues remainder to node earnings
     */
    function settle(bytes32 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];
        if (!session.active) revert SessionInactive();
        
        uint256 elapsed = block.timestamp - session.lastSettleTime;
        if (elapsed == 0) return;

        uint256 elapsedMinutes = (elapsed + 59) / 60;

        uint256 cost = session.ratePerMinute * elapsedMinutes;
        uint256 available = session.deposited - session.settled;

        if (cost > available) {
            cost = available;
            elapsedMinutes = available / session.ratePerMinute;
            if (available % session.ratePerMinute != 0) {
                elapsedMinutes += 1;
            }
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

        uint256 protocolFee = (cost * session.protocolFeeBps) / 10000;
        uint256 nodeEarning = cost - protocolFee;

        session.settled += cost;
        session.lastSettleTime = block.timestamp;

        totalProtocolFees += protocolFee;

        if (!token.transfer(address(nodeRegistry), nodeEarning)) {
            revert TransferFailed();
        }
        nodeRegistry.addEarnings(session.nodeId, nodeEarning);

        if (session.settled >= available) {
            session.active = false;
        }

        emit SessionSettled(sessionId, elapsedMinutes, cost, protocolFee, nodeEarning);
    }

    /**
     * @notice Stops an active session and processes final settlement
     * @param sessionId The ID of the session to stop
     * @dev Performs final settlement, then refunds remaining balance to user
     * Can be called by session user or contract owner
     */
    function stopSession(bytes32 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];
        if (!session.active) revert SessionInactive();
        if (msg.sender != session.user && msg.sender != owner()) {
            revert NotAuthorized();
        }

        if (block.timestamp > session.lastSettleTime) {
            uint256 elapsed = block.timestamp - session.lastSettleTime;
            uint256 elapsedMinutes = (elapsed + 59) / 60;

            uint256 cost = session.ratePerMinute * elapsedMinutes;
            uint256 available = session.deposited - session.settled;

            if (cost > available) {
                cost = available;
                elapsedMinutes = available / session.ratePerMinute;
                if (available % session.ratePerMinute != 0) {
                    elapsedMinutes += 1;
                }
            }

            if (session.settled + cost > session.maxSpend) {
                cost = session.maxSpend - session.settled;
            }

            if (cost > 0) {
                uint256 protocolFee = (cost * session.protocolFeeBps) / 10000;
                uint256 nodeEarning = cost - protocolFee;

                session.settled += cost;
                totalProtocolFees += protocolFee;

                if (!token.transfer(address(nodeRegistry), nodeEarning)) {
                    revert TransferFailed();
                }
                nodeRegistry.addEarnings(session.nodeId, nodeEarning);

                emit SessionSettled(sessionId, elapsedMinutes, cost, protocolFee, nodeEarning);
            }
        }

        session.active = false;

        uint256 refund = session.deposited - session.settled;
        if (refund > 0) {
            if (!token.transfer(session.user, refund)) revert TransferFailed();
        }

        emit SessionStopped(sessionId, refund);
    }

    /**
     * @notice Claims accumulated earnings for a node
     * @param nodeId The ID of the node
     * @dev Convenience function that calls NodeRegistry.claimEarnings
     */
    function claimEarnings(uint256 nodeId) external nonReentrant {
        nodeRegistry.claimEarnings(nodeId);
    }

    /**
     * @notice Gets the status of a session
     * @param sessionId The ID of the session
     * @return user The session user
     * @return nodeId The node ID
     * @return ratePerMinute The rate per minute
     * @return maxSpend The maximum spend limit
     * @return deposited The deposited amount
     * @return settled The settled amount
     * @return startTime The start timestamp
     * @return lastSettleTime The last settlement timestamp
     * @return protocolFeeBps The protocol fee in basis points
     * @return active Whether the session is active
     */
    function getSessionStatus(bytes32 sessionId) external view returns (
        address user,
        uint256 nodeId,
        uint256 ratePerMinute,
        uint256 maxSpend,
        uint256 deposited,
        uint256 settled,
        uint256 startTime,
        uint256 lastSettleTime,
        uint256 protocolFeeBps,
        bool active
    ) {
        Session memory session = sessions[sessionId];
        if (session.startTime == 0) revert InvalidSession();
        return (
            session.user,
            session.nodeId,
            session.ratePerMinute,
            session.maxSpend,
            session.deposited,
            session.settled,
            session.startTime,
            session.lastSettleTime,
            session.protocolFeeBps,
            session.active
        );
    }

    /**
     * @notice Gets a user's available balance
     * @param user The user address
     * @return The available balance
     */
    function getUserBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }

    /**
     * @notice Gets a node's accumulated earnings
     * @param nodeId The node ID
     * @return The accumulated earnings
     */
    function getNodeEarnings(uint256 nodeId) external view returns (uint256) {
        (
            ,
            ,
            ,
            ,
            ,
            uint256 earnings,
            ,
        ) = nodeRegistry.getNode(nodeId);
        return earnings;
    }

    /**
     * @notice Gets all session IDs for a user
     * @param user The user address
     * @return An array of session IDs
     */
    function getUserSessions(address user) external view returns (bytes32[] memory) {
        return userSessions[user];
    }

    /**
     * @notice Gets all session IDs for a node
     * @param nodeId The node ID
     * @return An array of session IDs
     */
    function getNodeSessions(uint256 nodeId) external view returns (bytes32[] memory) {
        return nodeSessions[nodeId];
    }

    /**
     * @notice Withdraws accumulated protocol fees to treasury
     * @dev Only callable by owner
     */
    function withdrawProtocolFees() external onlyOwner nonReentrant {
        if (totalProtocolFees == 0) revert NoProtocolFees();
        
        uint256 amount = totalProtocolFees;
        totalProtocolFees = 0;

        if (!token.transfer(treasury, amount)) revert TransferFailed();

        emit ProtocolFeesWithdrawn(treasury, amount);
    }

    /**
     * @notice Updates the treasury address
     * @param _treasury The new treasury address
     * @dev Only callable by owner
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice Updates the protocol fee basis points
     * @param _protocolFeeBps The new protocol fee in basis points
     * @dev Only callable by owner, affects new sessions only
     */
    function setProtocolFeeBps(uint256 _protocolFeeBps) external onlyOwner {
        if (_protocolFeeBps > 10000) revert InvalidFeeBps();
        protocolFeeBps = _protocolFeeBps;
        emit ProtocolFeeBpsUpdated(_protocolFeeBps);
    }

    /**
     * @notice Pauses the contract
     * @dev Only callable by owner, prevents deposits and new sessions
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     * @dev Only callable by owner
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
