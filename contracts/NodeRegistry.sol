// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title NodeRegistry
 * @notice Registry for compute nodes in the X402 Protocol
 * @dev Manages node registration, metadata, rates, and earnings with access control
 * Nodes are identified by auto-incrementing IDs, and operators can manage their own nodes
 */
contract NodeRegistry is Ownable, ReentrancyGuard, Pausable {
    /**
     * @notice Node metadata structure
     * @param operator The address of the node operator
     * @param endpoint The network endpoint for the node
     * @param region The geographical region of the node
     * @param metadataURI URI pointing to additional node metadata
     * @param ratePerMinute The rate charged per minute of compute time
     * @param earnings Accumulated earnings for the node
     * @param active Whether the node is currently active
     * @param registeredAt Timestamp when the node was registered
     */
    struct Node {
        address operator;
        string endpoint;
        string region;
        string metadataURI;
        uint256 ratePerMinute;
        uint256 earnings;
        bool active;
        uint256 registeredAt;
    }

    error InvalidEndpoint();
    error InvalidRate();
    error InvalidNode();
    error NotOperator();
    error AlreadyInactive();
    error AlreadyActive();
    error NoEarnings();
    error TransferFailed();
    error RegistrationFeeFailed();

    IERC20 public token;
    mapping(uint256 => Node) public nodes;
    mapping(address => uint256[]) public operatorNodes;
    uint256 public nodeCount;
    uint256 public registrationFee;

    event NodeRegistered(
        uint256 indexed nodeId,
        address indexed operator,
        string endpoint,
        string region,
        string metadataURI,
        uint256 ratePerMinute
    );
    event NodeUpdated(
        uint256 indexed nodeId,
        string endpoint,
        string region,
        string metadataURI,
        uint256 ratePerMinute
    );
    event NodeDeactivated(uint256 indexed nodeId);
    event NodeReactivated(uint256 indexed nodeId);
    event EarningsClaimed(uint256 indexed nodeId, address indexed operator, uint256 amount);
    event RegistrationFeeUpdated(uint256 newFee);

    /**
     * @notice Constructs the NodeRegistry contract
     * @param _token The ERC20 token address for payments
     * @param _registrationFee The fee required to register a node
     */
    constructor(address _token, uint256 _registrationFee) Ownable(msg.sender) {
        token = IERC20(_token);
        registrationFee = _registrationFee;
    }

    /**
     * @notice Registers a new compute node
     * @param endpoint The network endpoint for the node
     * @param region The geographical region of the node
     * @param metadataURI URI pointing to additional node metadata
     * @param ratePerMinute The rate charged per minute of compute time
     * @return nodeId The ID of the newly registered node
     * @dev Requires registration fee payment if non-zero
     */
    function registerNode(
        string calldata endpoint,
        string calldata region,
        string calldata metadataURI,
        uint256 ratePerMinute
    ) external whenNotPaused returns (uint256) {
        if (bytes(endpoint).length == 0) revert InvalidEndpoint();
        if (ratePerMinute == 0) revert InvalidRate();

        if (registrationFee > 0) {
            if (!token.transferFrom(msg.sender, address(this), registrationFee)) {
                revert RegistrationFeeFailed();
            }
        }

        uint256 nodeId = nodeCount++;
        nodes[nodeId] = Node({
            operator: msg.sender,
            endpoint: endpoint,
            region: region,
            metadataURI: metadataURI,
            ratePerMinute: ratePerMinute,
            earnings: 0,
            active: true,
            registeredAt: block.timestamp
        });

        operatorNodes[msg.sender].push(nodeId);

        emit NodeRegistered(nodeId, msg.sender, endpoint, region, metadataURI, ratePerMinute);
        return nodeId;
    }

    /**
     * @notice Updates an existing node's metadata and rate
     * @param nodeId The ID of the node to update
     * @param endpoint The new network endpoint
     * @param region The new geographical region
     * @param metadataURI The new metadata URI
     * @param ratePerMinute The new rate per minute
     * @dev Only callable by the node operator
     */
    function updateNode(
        uint256 nodeId,
        string calldata endpoint,
        string calldata region,
        string calldata metadataURI,
        uint256 ratePerMinute
    ) external {
        if (nodeId >= nodeCount) revert InvalidNode();
        if (nodes[nodeId].operator != msg.sender) revert NotOperator();
        if (bytes(endpoint).length == 0) revert InvalidEndpoint();
        if (ratePerMinute == 0) revert InvalidRate();

        nodes[nodeId].endpoint = endpoint;
        nodes[nodeId].region = region;
        nodes[nodeId].metadataURI = metadataURI;
        nodes[nodeId].ratePerMinute = ratePerMinute;

        emit NodeUpdated(nodeId, endpoint, region, metadataURI, ratePerMinute);
    }

    /**
     * @notice Deactivates a node
     * @param nodeId The ID of the node to deactivate
     * @dev Only callable by the node operator
     */
    function deactivateNode(uint256 nodeId) external {
        if (nodeId >= nodeCount) revert InvalidNode();
        if (nodes[nodeId].operator != msg.sender) revert NotOperator();
        if (!nodes[nodeId].active) revert AlreadyInactive();

        nodes[nodeId].active = false;
        emit NodeDeactivated(nodeId);
    }

    /**
     * @notice Reactivates a previously deactivated node
     * @param nodeId The ID of the node to reactivate
     * @dev Only callable by the node operator
     */
    function reactivateNode(uint256 nodeId) external whenNotPaused {
        if (nodeId >= nodeCount) revert InvalidNode();
        if (nodes[nodeId].operator != msg.sender) revert NotOperator();
        if (nodes[nodeId].active) revert AlreadyActive();

        nodes[nodeId].active = true;
        emit NodeReactivated(nodeId);
    }

    /**
     * @notice Adds earnings to a node's balance
     * @param nodeId The ID of the node
     * @param amount The amount to add to earnings
     * @dev Internal function called by SessionManager
     */
    function addEarnings(uint256 nodeId, uint256 amount) external {
        if (nodeId >= nodeCount) revert InvalidNode();
        nodes[nodeId].earnings += amount;
    }

    /**
     * @notice Claims accumulated earnings for a node
     * @param nodeId The ID of the node
     * @dev Only callable by the node operator, transfers earnings to operator
     */
    function claimEarnings(uint256 nodeId) external nonReentrant {
        if (nodeId >= nodeCount) revert InvalidNode();
        Node storage node = nodes[nodeId];
        if (node.operator != msg.sender) revert NotOperator();
        if (node.earnings == 0) revert NoEarnings();

        uint256 amount = node.earnings;
        node.earnings = 0;

        if (!token.transfer(msg.sender, amount)) revert TransferFailed();

        emit EarningsClaimed(nodeId, msg.sender, amount);
    }

    /**
     * @notice Retrieves detailed information about a node
     * @param nodeId The ID of the node
     * @return operator The node operator address
     * @return endpoint The network endpoint
     * @return region The geographical region
     * @return metadataURI The metadata URI
     * @return ratePerMinute The rate per minute
     * @return earnings The accumulated earnings
     * @return active Whether the node is active
     * @return registeredAt The registration timestamp
     */
    function getNode(uint256 nodeId) external view returns (
        address operator,
        string memory endpoint,
        string memory region,
        string memory metadataURI,
        uint256 ratePerMinute,
        uint256 earnings,
        bool active,
        uint256 registeredAt
    ) {
        if (nodeId >= nodeCount) revert InvalidNode();
        Node memory node = nodes[nodeId];
        return (
            node.operator,
            node.endpoint,
            node.region,
            node.metadataURI,
            node.ratePerMinute,
            node.earnings,
            node.active,
            node.registeredAt
        );
    }

    /**
     * @notice Gets all node IDs operated by an address
     * @param operator The operator address
     * @return An array of node IDs
     */
    function getOperatorNodes(address operator) external view returns (uint256[] memory) {
        return operatorNodes[operator];
    }

    /**
     * @notice Updates the registration fee
     * @param _registrationFee The new registration fee
     * @dev Only callable by owner
     */
    function setRegistrationFee(uint256 _registrationFee) external onlyOwner {
        registrationFee = _registrationFee;
        emit RegistrationFeeUpdated(_registrationFee);
    }

    /**
     * @notice Pauses the contract
     * @dev Only callable by owner, prevents new registrations and reactivations
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
