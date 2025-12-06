// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NodeRegistry is Ownable, ReentrancyGuard, Pausable {
    struct Node {
        address operator;
        string endpoint;
        uint256 rate;
        uint256 earnings;
        bool active;
        uint256 registeredAt;
    }

    IERC20 public token;
    mapping(uint256 => Node) public nodes;
    mapping(address => uint256[]) public operatorNodes;
    uint256 public nodeCount;
    uint256 public registrationFee;

    event NodeRegistered(uint256 indexed nodeId, address indexed operator, string endpoint, uint256 rate);
    event NodeUpdated(uint256 indexed nodeId, string endpoint, uint256 rate);
    event NodeDeactivated(uint256 indexed nodeId);
    event NodeReactivated(uint256 indexed nodeId);
    event EarningsClaimed(uint256 indexed nodeId, address indexed operator, uint256 amount);
    event RegistrationFeeUpdated(uint256 newFee);

    constructor(address _token, uint256 _registrationFee) Ownable(msg.sender) {
        token = IERC20(_token);
        registrationFee = _registrationFee;
    }

    function registerNode(
        string calldata endpoint,
        uint256 rate
    ) external whenNotPaused returns (uint256) {
        require(bytes(endpoint).length > 0, "Empty endpoint");
        require(rate > 0, "Rate must be positive");

        if (registrationFee > 0) {
            require(
                token.transferFrom(msg.sender, address(this), registrationFee),
                "Registration fee transfer failed"
            );
        }

        uint256 nodeId = nodeCount++;
        nodes[nodeId] = Node({
            operator: msg.sender,
            endpoint: endpoint,
            rate: rate,
            earnings: 0,
            active: true,
            registeredAt: block.timestamp
        });

        operatorNodes[msg.sender].push(nodeId);

        emit NodeRegistered(nodeId, msg.sender, endpoint, rate);
        return nodeId;
    }

    function updateNode(
        uint256 nodeId,
        string calldata endpoint,
        uint256 rate
    ) external {
        require(nodeId < nodeCount, "Invalid node");
        require(nodes[nodeId].operator == msg.sender, "Not operator");
        require(bytes(endpoint).length > 0, "Empty endpoint");
        require(rate > 0, "Rate must be positive");

        nodes[nodeId].endpoint = endpoint;
        nodes[nodeId].rate = rate;

        emit NodeUpdated(nodeId, endpoint, rate);
    }

    function deactivateNode(uint256 nodeId) external {
        require(nodeId < nodeCount, "Invalid node");
        require(nodes[nodeId].operator == msg.sender, "Not operator");
        require(nodes[nodeId].active, "Already inactive");

        nodes[nodeId].active = false;
        emit NodeDeactivated(nodeId);
    }

    function reactivateNode(uint256 nodeId) external whenNotPaused {
        require(nodeId < nodeCount, "Invalid node");
        require(nodes[nodeId].operator == msg.sender, "Not operator");
        require(!nodes[nodeId].active, "Already active");

        nodes[nodeId].active = true;
        emit NodeReactivated(nodeId);
    }

    function addEarnings(uint256 nodeId, uint256 amount) external {
        require(nodeId < nodeCount, "Invalid node");
        nodes[nodeId].earnings += amount;
    }

    function claimEarnings(uint256 nodeId) external nonReentrant {
        require(nodeId < nodeCount, "Invalid node");
        Node storage node = nodes[nodeId];
        require(node.operator == msg.sender, "Not operator");
        require(node.earnings > 0, "No earnings");

        uint256 amount = node.earnings;
        node.earnings = 0;

        require(token.transfer(msg.sender, amount), "Transfer failed");

        emit EarningsClaimed(nodeId, msg.sender, amount);
    }

    function getNode(uint256 nodeId) external view returns (
        address operator,
        string memory endpoint,
        uint256 rate,
        uint256 earnings,
        bool active,
        uint256 registeredAt
    ) {
        require(nodeId < nodeCount, "Invalid node");
        Node memory node = nodes[nodeId];
        return (
            node.operator,
            node.endpoint,
            node.rate,
            node.earnings,
            node.active,
            node.registeredAt
        );
    }

    function getOperatorNodes(address operator) external view returns (uint256[] memory) {
        return operatorNodes[operator];
    }

    function setRegistrationFee(uint256 _registrationFee) external onlyOwner {
        registrationFee = _registrationFee;
        emit RegistrationFeeUpdated(_registrationFee);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
