// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title MandateVault
/// @notice Prepaid allowance + policy gate + settlement receipts for A2A agent payments.
/// @dev HSP settles stablecoins; this contract is the HSK Chain control plane.
contract MandateVault {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Policy {
        uint128 maxPerPayment; // 0 = unlimited per tx (still subject to other caps)
        uint128 dailyCap; // 0 = no daily cap
        uint128 totalCap; // 0 = no lifetime cap
        uint64 expiresAt; // 0 = no expiry
        bool frozen;
        bool exists;
    }

    struct AgentState {
        uint128 balance; // prepaid envelope remaining
        uint128 spentTotal;
        uint128 spentToday;
        uint64 dayStart; // unix day bucket (UTC midnight)
        Policy policy;
    }

    struct Receipt {
        address agent;
        address merchant;
        uint128 amount;
        bytes32 mandateId;
        bytes32 paymentRef;
        bytes32 settleTxHash;
        uint64 timestamp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    IERC20 public immutable token;
    address public owner;

    mapping(address => bool) public operators; // backend relayers that may authorize/settle
    mapping(address => AgentState) public agents;
    mapping(address => mapping(address => bool)) public merchantAllowed; // agent => merchant => ok
    mapping(bytes32 => bool) public mandateUsed; // prevent double-authorize
    mapping(bytes32 => bool) public paymentRefUsed;

    Receipt[] public receipts;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool allowed);
    event AgentFunded(address indexed agent, address indexed from, uint128 amount, uint128 newBalance);
    event AgentWithdrawn(address indexed agent, address indexed to, uint128 amount, uint128 newBalance);
    event PolicyUpdated(
        address indexed agent,
        uint128 maxPerPayment,
        uint128 dailyCap,
        uint128 totalCap,
        uint64 expiresAt,
        bool frozen
    );
    event MerchantAllowlistUpdated(address indexed agent, address indexed merchant, bool allowed);
    event PaymentAuthorized(
        address indexed agent,
        address indexed merchant,
        uint128 amount,
        bytes32 indexed mandateId,
        uint128 remainingBalance
    );
    event PaymentBlocked(
        address indexed agent,
        address indexed merchant,
        uint128 amount,
        bytes32 mandateId,
        string reason
    );
    event SettlementRecorded(
        uint256 indexed receiptId,
        address indexed agent,
        address indexed merchant,
        uint128 amount,
        bytes32 mandateId,
        bytes32 paymentRef
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error NotOwner();
    error NotOperator();
    error ZeroAddress();
    error ZeroAmount();
    error AgentNotConfigured();
    error InsufficientBalance();
    error AgentFrozen();
    error PolicyExpired();
    error ExceedsMaxPerPayment();
    error ExceedsDailyCap();
    error ExceedsTotalCap();
    error MerchantNotAllowed();
    error MandateAlreadyUsed();
    error PaymentRefAlreadyUsed();
    error TransferFailed();

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && !operators[msg.sender]) revert NotOperator();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address token_, address owner_) {
        if (token_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        owner = owner_;
        operators[owner_] = true;
        emit OwnershipTransferred(address(0), owner_);
        emit OperatorUpdated(owner_, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    /// @notice Fund an agent's prepaid envelope with ERC-20 stablecoins.
    function fund(address agent, uint128 amount) external {
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _ensureDay(agent);
        agents[agent].balance += amount;
        agents[agent].policy.exists = true;

        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit AgentFunded(agent, msg.sender, amount, agents[agent].balance);
    }

    /// @notice Owner-only credit for demos / off-chain mirrored budgets (no token pull).
    /// @dev Prefer `fund` for production; `credit` is for hackathon demo when using mock HSP.
    function credit(address agent, uint128 amount) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _ensureDay(agent);
        agents[agent].balance += amount;
        agents[agent].policy.exists = true;
        emit AgentFunded(agent, msg.sender, amount, agents[agent].balance);
    }

    /// @notice Withdraw unused allowance back to owner (or specified recipient).
    function withdraw(address agent, address to, uint128 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (agents[agent].balance < amount) revert InsufficientBalance();

        agents[agent].balance -= amount;
        if (!token.transfer(to, amount)) revert TransferFailed();

        emit AgentWithdrawn(agent, to, amount, agents[agent].balance);
    }

    function setPolicy(
        address agent,
        uint128 maxPerPayment,
        uint128 dailyCap,
        uint128 totalCap,
        uint64 expiresAt,
        bool frozen
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        _ensureDay(agent);
        Policy storage p = agents[agent].policy;
        p.maxPerPayment = maxPerPayment;
        p.dailyCap = dailyCap;
        p.totalCap = totalCap;
        p.expiresAt = expiresAt;
        p.frozen = frozen;
        p.exists = true;

        emit PolicyUpdated(agent, maxPerPayment, dailyCap, totalCap, expiresAt, frozen);
    }

    function setMerchantAllowed(address agent, address merchant, bool allowed) external onlyOwner {
        if (agent == address(0) || merchant == address(0)) revert ZeroAddress();
        agents[agent].policy.exists = true;
        merchantAllowed[agent][merchant] = allowed;
        emit MerchantAllowlistUpdated(agent, merchant, allowed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Payment gate
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Soft check used by the dashboard / buyer agent before signing.
    function checkAuthorization(address agent, address merchant, uint128 amount)
        external
        view
        returns (bool ok, string memory reason)
    {
        return _evaluate(agent, merchant, amount);
    }

    /// @notice Hard gate: debit envelope + spend counters. Reverts with typed errors on deny.
    function authorize(address agent, address merchant, uint128 amount, bytes32 mandateId)
        external
        onlyOperator
        returns (uint128 remainingBalance)
    {
        if (mandateId == bytes32(0)) revert ZeroAmount();
        if (mandateUsed[mandateId]) revert MandateAlreadyUsed();

        (bool ok, string memory reason) = _evaluate(agent, merchant, amount);
        if (!ok) {
            emit PaymentBlocked(agent, merchant, amount, mandateId, reason);
            _revertReason(reason);
        }

        _ensureDay(agent);
        AgentState storage s = agents[agent];
        s.balance -= amount;
        s.spentToday += amount;
        s.spentTotal += amount;
        mandateUsed[mandateId] = true;

        emit PaymentAuthorized(agent, merchant, amount, mandateId, s.balance);
        return s.balance;
    }

    /// @notice Record HSP settlement proof on-chain after Gateway success.
    function recordSettlement(
        address agent,
        address merchant,
        uint128 amount,
        bytes32 mandateId,
        bytes32 paymentRef,
        bytes32 settleTxHash
    ) external onlyOperator returns (uint256 receiptId) {
        if (paymentRef == bytes32(0)) revert ZeroAmount();
        if (paymentRefUsed[paymentRef]) revert PaymentRefAlreadyUsed();

        paymentRefUsed[paymentRef] = true;
        receiptId = receipts.length;
        receipts.push(
            Receipt({
                agent: agent,
                merchant: merchant,
                amount: amount,
                mandateId: mandateId,
                paymentRef: paymentRef,
                settleTxHash: settleTxHash,
                timestamp: uint64(block.timestamp)
            })
        );

        emit SettlementRecorded(receiptId, agent, merchant, amount, mandateId, paymentRef);
    }

    function receiptCount() external view returns (uint256) {
        return receipts.length;
    }

    function getReceipt(uint256 id) external view returns (Receipt memory) {
        return receipts[id];
    }

    function getAgent(address agent)
        external
        view
        returns (
            uint128 balance,
            uint128 spentTotal,
            uint128 spentToday,
            uint64 dayStart,
            Policy memory policy
        )
    {
        AgentState storage s = agents[agent];
        return (s.balance, s.spentTotal, _todaySpent(agent), s.dayStart, s.policy);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _evaluate(address agent, address merchant, uint128 amount)
        internal
        view
        returns (bool ok, string memory reason)
    {
        if (amount == 0) return (false, "zero_amount");
        if (merchant == address(0)) return (false, "zero_merchant");

        AgentState storage s = agents[agent];
        Policy memory p = s.policy;

        if (!p.exists) return (false, "agent_not_configured");
        if (p.frozen) return (false, "agent_frozen");
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) return (false, "policy_expired");
        if (!merchantAllowed[agent][merchant]) return (false, "merchant_not_allowed");
        if (p.maxPerPayment != 0 && amount > p.maxPerPayment) return (false, "exceeds_max_per_payment");
        if (s.balance < amount) return (false, "insufficient_balance");

        uint128 today = _todaySpent(agent);
        if (p.dailyCap != 0 && today + amount > p.dailyCap) return (false, "exceeds_daily_cap");
        if (p.totalCap != 0 && s.spentTotal + amount > p.totalCap) return (false, "exceeds_total_cap");

        return (true, "");
    }

    function _todaySpent(address agent) internal view returns (uint128) {
        AgentState storage s = agents[agent];
        uint64 today = _dayBucket(uint64(block.timestamp));
        if (s.dayStart != today) return 0;
        return s.spentToday;
    }

    function _ensureDay(address agent) internal {
        uint64 today = _dayBucket(uint64(block.timestamp));
        AgentState storage s = agents[agent];
        if (s.dayStart != today) {
            s.dayStart = today;
            s.spentToday = 0;
        }
    }

    function _dayBucket(uint64 ts) internal pure returns (uint64) {
        return ts - (ts % 1 days);
    }

    function _revertReason(string memory reason) internal pure {
        bytes32 key = keccak256(bytes(reason));
        if (key == keccak256("agent_not_configured")) revert AgentNotConfigured();
        if (key == keccak256("agent_frozen")) revert AgentFrozen();
        if (key == keccak256("policy_expired")) revert PolicyExpired();
        if (key == keccak256("merchant_not_allowed")) revert MerchantNotAllowed();
        if (key == keccak256("exceeds_max_per_payment")) revert ExceedsMaxPerPayment();
        if (key == keccak256("insufficient_balance")) revert InsufficientBalance();
        if (key == keccak256("exceeds_daily_cap")) revert ExceedsDailyCap();
        if (key == keccak256("exceeds_total_cap")) revert ExceedsTotalCap();
        revert AgentNotConfigured();
    }
}
