// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {BITE} from "@skalenetwork/bite-solidity/BITE.sol";
import {IBiteSupplicant} from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";

/**
 * @title ShadowPool
 * @notice A sealed-order dark pool using BITE v2 Conditional Transactions on SKALE.
 *
 *         Orders are encrypted on the client and stored on-chain. Only aggregate
 *         stats (buy/sell count, total deposited volume) are visible. When matching
 *         is triggered, all pending orders are decrypted via CTX and matched at a
 *         uniform clearing price. Individual order details are never publicly visible
 *         before settlement.
 *
 *         Trading pair: baseToken (DARK) / quoteToken (USDC)
 *         Prices are expressed as quoteToken per baseToken (USDC per DARK).
 *         Price uses 6 decimal precision (1_000_000 = 1.000000 USDC per DARK).
 */
contract ShadowPool is IBiteSupplicant, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address payable;

    // ─── Constants ────────────────────────────────────────────────────
    uint256 public constant CTX_GAS_LIMIT = 2_500_000;
    uint256 public constant CTX_GAS_PAYMENT = 0.06 ether;
    uint256 public constant MAX_ORDERS_PER_MATCH = 10;
    uint256 public constant PRICE_PRECISION = 1e6; // 6 decimal price
    uint256 public constant DECIMAL_SCALE = 1e12; // 10^(baseDecimals - quoteDecimals) = 10^(18-6)

    // ─── Immutables ───────────────────────────────────────────────────
    IERC20 public immutable baseToken;  // DARK (18 decimals)
    IERC20 public immutable quoteToken; // USDC (6 decimals)

    // ─── Enums ────────────────────────────────────────────────────────
    enum OrderStatus {
        PENDING,    // Encrypted, waiting for match
        MATCHED,    // Filled during settlement
        PARTIALLY_MATCHED, // Partially filled
        CANCELLED,  // Cancelled by trader
        REFUNDED    // Refunded after failed match
    }

    // ─── Structs ──────────────────────────────────────────────────────
    struct Order {
        address trader;
        bool isBuy;              // PUBLIC: for aggregate stats
        uint256 deposit;         // PUBLIC: tokens deposited
        bytes encryptedOrder;    // ENCRYPTED: (uint256 price, uint256 amount)
        OrderStatus status;
        uint256 createdAt;
        uint256 settledPrice;    // Set after match
        uint256 settledAmount;   // Set after match
    }

    struct Settlement {
        uint256 clearingPrice;
        uint256 matchedVolume;   // In base token units
        uint256 totalTrades;
        uint256 timestamp;
        uint256[] matchedOrderIds;
    }

    // ─── State ────────────────────────────────────────────────────────
    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    // Pending order pool
    uint256[] public pendingBuyOrderIds;
    uint256[] public pendingSellOrderIds;

    // Settlement history
    uint256 public nextSettlementId;
    mapping(uint256 => Settlement) public settlements;

    // Aggregate stats (live, public)
    uint256 public totalPendingBuys;
    uint256 public totalPendingSells;
    uint256 public totalBuyDeposits;   // Total USDC deposited by pending buys
    uint256 public totalSellDeposits;  // Total DARK deposited by pending sells

    // Matching state
    bool public isMatching;

    // Per-user order tracking
    mapping(address => uint256[]) public userOrders;

    // ─── Events ───────────────────────────────────────────────────────
    event OrderSubmitted(
        uint256 indexed orderId,
        address indexed trader,
        bool isBuy,
        uint256 deposit,
        uint256 timestamp
    );

    event OrderCancelled(
        uint256 indexed orderId,
        address indexed trader
    );

    event MatchTriggered(
        uint256 indexed settlementId,
        uint256 buyCount,
        uint256 sellCount,
        address triggeredBy
    );

    event MatchSettled(
        uint256 indexed settlementId,
        uint256 clearingPrice,
        uint256 matchedVolume,
        uint256 totalTrades,
        uint256 timestamp
    );

    event OrderFilled(
        uint256 indexed orderId,
        uint256 indexed settlementId,
        uint256 price,
        uint256 amount
    );

    event OrderRefunded(
        uint256 indexed orderId,
        address indexed trader,
        uint256 amount
    );

    // ─── Errors ───────────────────────────────────────────────────────
    error InvalidDeposit();
    error InvalidEncryptedOrder();
    error OrderNotFound();
    error NotOrderOwner();
    error OrderNotPending();
    error NoPendingOrders();
    error AlreadyMatching();
    error InsufficientCTXPayment();
    error TooManyOrders();

    // ─── Constructor ──────────────────────────────────────────────────
    constructor(address _baseToken, address _quoteToken) {
        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);
    }

    // ─── Order Submission ─────────────────────────────────────────────

    /**
     * @notice Submit an encrypted buy order. Deposit quoteToken (USDC).
     * @param _encryptedOrder BITE-encrypted payload: (uint256 price, uint256 amount)
     * @param _deposit Amount of quoteToken to deposit (max spend)
     */
    function submitBuyOrder(
        bytes calldata _encryptedOrder,
        uint256 _deposit
    ) external nonReentrant returns (uint256 orderId) {
        if (_encryptedOrder.length == 0) revert InvalidEncryptedOrder();
        if (_deposit == 0) revert InvalidDeposit();

        quoteToken.safeTransferFrom(msg.sender, address(this), _deposit);

        orderId = nextOrderId++;
        orders[orderId] = Order({
            trader: msg.sender,
            isBuy: true,
            deposit: _deposit,
            encryptedOrder: _encryptedOrder,
            status: OrderStatus.PENDING,
            createdAt: block.timestamp,
            settledPrice: 0,
            settledAmount: 0
        });

        pendingBuyOrderIds.push(orderId);
        userOrders[msg.sender].push(orderId);
        totalPendingBuys++;
        totalBuyDeposits += _deposit;

        emit OrderSubmitted(orderId, msg.sender, true, _deposit, block.timestamp);
    }

    /**
     * @notice Submit an encrypted sell order. Deposit baseToken (DARK).
     * @param _encryptedOrder BITE-encrypted payload: (uint256 price, uint256 amount)
     * @param _deposit Amount of baseToken to deposit (max sell)
     */
    function submitSellOrder(
        bytes calldata _encryptedOrder,
        uint256 _deposit
    ) external nonReentrant returns (uint256 orderId) {
        if (_encryptedOrder.length == 0) revert InvalidEncryptedOrder();
        if (_deposit == 0) revert InvalidDeposit();

        baseToken.safeTransferFrom(msg.sender, address(this), _deposit);

        orderId = nextOrderId++;
        orders[orderId] = Order({
            trader: msg.sender,
            isBuy: false,
            deposit: _deposit,
            encryptedOrder: _encryptedOrder,
            status: OrderStatus.PENDING,
            createdAt: block.timestamp,
            settledPrice: 0,
            settledAmount: 0
        });

        pendingSellOrderIds.push(orderId);
        userOrders[msg.sender].push(orderId);
        totalPendingSells++;
        totalSellDeposits += _deposit;

        emit OrderSubmitted(orderId, msg.sender, false, _deposit, block.timestamp);
    }

    /**
     * @notice Cancel a pending order and get a full refund.
     */
    function cancelOrder(uint256 _orderId) external nonReentrant {
        Order storage order = orders[_orderId];
        if (order.trader == address(0)) revert OrderNotFound();
        if (order.trader != msg.sender) revert NotOrderOwner();
        if (order.status != OrderStatus.PENDING) revert OrderNotPending();

        order.status = OrderStatus.CANCELLED;

        // Refund deposit
        if (order.isBuy) {
            quoteToken.safeTransfer(msg.sender, order.deposit);
            totalPendingBuys--;
            totalBuyDeposits -= order.deposit;
            _removePendingOrder(pendingBuyOrderIds, _orderId);
        } else {
            baseToken.safeTransfer(msg.sender, order.deposit);
            totalPendingSells--;
            totalSellDeposits -= order.deposit;
            _removePendingOrder(pendingSellOrderIds, _orderId);
        }

        emit OrderCancelled(_orderId, msg.sender);
    }

    // ─── Match Trigger ────────────────────────────────────────────────

    /**
     * @notice Trigger matching of all pending orders via BITE v2 CTX.
     *         Requires 0.06 sFUEL for CTX gas payment.
     *         Anyone can call this.
     */
    function triggerMatch() external payable nonReentrant {
        if (isMatching) revert AlreadyMatching();
        if (msg.value < CTX_GAS_PAYMENT) revert InsufficientCTXPayment();

        uint256 buyCount = pendingBuyOrderIds.length;
        uint256 sellCount = pendingSellOrderIds.length;
        if (buyCount == 0 || sellCount == 0) revert NoPendingOrders();

        uint256 totalOrders = buyCount + sellCount;
        if (totalOrders > MAX_ORDERS_PER_MATCH) revert TooManyOrders();

        isMatching = true;

        // Collect all encrypted orders for CTX decryption
        bytes[] memory encryptedArgs = new bytes[](totalOrders);

        for (uint256 i = 0; i < buyCount; i++) {
            encryptedArgs[i] = orders[pendingBuyOrderIds[i]].encryptedOrder;
        }
        for (uint256 i = 0; i < sellCount; i++) {
            encryptedArgs[buyCount + i] = orders[pendingSellOrderIds[i]].encryptedOrder;
        }

        // Plaintext args: buyCount so onDecrypt knows the split
        bytes[] memory plaintextArgs = new bytes[](3);
        plaintextArgs[0] = abi.encode(buyCount);
        plaintextArgs[1] = abi.encode(sellCount);
        plaintextArgs[2] = abi.encode(nextSettlementId);

        // Submit CTX
        address payable ctxSender = BITE.submitCTX(
            BITE.SUBMIT_CTX_ADDRESS,
            CTX_GAS_LIMIT,
            encryptedArgs,
            plaintextArgs
        );

        ctxSender.sendValue(msg.value);

        uint256 settlementId = nextSettlementId++;

        emit MatchTriggered(settlementId, buyCount, sellCount, msg.sender);
    }

    /**
     * @notice BITE v2 callback after CTX decryption.
     *         Decodes all orders, finds clearing price, settles matches.
     */
    function onDecrypt(
        bytes[] calldata decryptedArguments,
        bytes[] calldata plaintextArguments
    ) external override nonReentrant {
        uint256 buyCount = abi.decode(plaintextArguments[0], (uint256));
        uint256 sellCount = abi.decode(plaintextArguments[1], (uint256));
        uint256 settlementId = abi.decode(plaintextArguments[2], (uint256));

        // Decode all orders: each is abi.encode(uint256 price, uint256 amount)
        uint256[] memory buyPrices = new uint256[](buyCount);
        uint256[] memory buyAmounts = new uint256[](buyCount);
        uint256[] memory sellPrices = new uint256[](sellCount);
        uint256[] memory sellAmounts = new uint256[](sellCount);

        for (uint256 i = 0; i < buyCount; i++) {
            (buyPrices[i], buyAmounts[i]) = abi.decode(
                decryptedArguments[i], (uint256, uint256)
            );
        }
        for (uint256 i = 0; i < sellCount; i++) {
            (sellPrices[i], sellAmounts[i]) = abi.decode(
                decryptedArguments[buyCount + i], (uint256, uint256)
            );
        }

        // Sort buys descending by price (simple insertion sort for small arrays)
        _sortDescending(pendingBuyOrderIds, buyPrices, buyAmounts, buyCount);
        _sortAscending(pendingSellOrderIds, sellPrices, sellAmounts, sellCount);

        // Match: walk through sorted buys (highest first) and sells (lowest first)
        uint256 totalMatchedVolume = 0;
        uint256 totalTrades = 0;
        uint256 clearingPrice = 0;
        uint256[] memory matchedIds = new uint256[](buyCount + sellCount);
        uint256 matchedCount = 0;

        uint256 bi = 0;
        uint256 si = 0;

        while (bi < buyCount && si < sellCount) {
            if (buyPrices[bi] < sellPrices[si]) break; // No more matchable orders

            // Clearing price = midpoint
            clearingPrice = (buyPrices[bi] + sellPrices[si]) / 2;

            // Match volume = min of both amounts
            uint256 matchAmount = buyAmounts[bi] < sellAmounts[si]
                ? buyAmounts[bi]
                : sellAmounts[si];

            if (matchAmount == 0) {
                bi++;
                si++;
                continue;
            }

            uint256 buyOrderId = pendingBuyOrderIds[bi];
            uint256 sellOrderId = pendingSellOrderIds[si];

            // Calculate cost in quote tokens (USDC, 6 decimals)
            // matchAmount is in 18 decimals, clearingPrice in 6-decimal precision
            // Dividing by DECIMAL_SCALE converts the result from 18 to 6 decimals
            uint256 cost = (matchAmount * clearingPrice) / (PRICE_PRECISION * DECIMAL_SCALE);

            // Settle: transfer base tokens to buyer, quote tokens to seller
            Order storage buyOrder = orders[buyOrderId];
            Order storage sellOrder = orders[sellOrderId];

            // Transfer DARK to buyer
            baseToken.safeTransfer(buyOrder.trader, matchAmount);
            // Transfer USDC to seller
            quoteToken.safeTransfer(sellOrder.trader, cost);

            // Update order records
            buyOrder.settledPrice = clearingPrice;
            buyOrder.settledAmount = matchAmount;
            buyOrder.status = OrderStatus.MATCHED;

            sellOrder.settledPrice = clearingPrice;
            sellOrder.settledAmount = matchAmount;
            sellOrder.status = OrderStatus.MATCHED;

            // Refund excess deposits
            if (buyOrder.deposit > cost) {
                quoteToken.safeTransfer(buyOrder.trader, buyOrder.deposit - cost);
            }
            if (sellOrder.deposit > matchAmount) {
                baseToken.safeTransfer(sellOrder.trader, sellOrder.deposit - matchAmount);
            }

            matchedIds[matchedCount++] = buyOrderId;
            matchedIds[matchedCount++] = sellOrderId;

            totalMatchedVolume += matchAmount;
            totalTrades++;

            emit OrderFilled(buyOrderId, settlementId, clearingPrice, matchAmount);
            emit OrderFilled(sellOrderId, settlementId, clearingPrice, matchAmount);

            // Consume amounts
            buyAmounts[bi] -= matchAmount;
            sellAmounts[si] -= matchAmount;

            if (buyAmounts[bi] == 0) bi++;
            if (sellAmounts[si] == 0) si++;
        }

        // Refund unmatched orders
        for (uint256 i = bi; i < buyCount; i++) {
            uint256 oid = pendingBuyOrderIds[i];
            Order storage o = orders[oid];
            if (o.status == OrderStatus.PENDING) {
                o.status = OrderStatus.REFUNDED;
                quoteToken.safeTransfer(o.trader, o.deposit);
                emit OrderRefunded(oid, o.trader, o.deposit);
            }
        }
        for (uint256 i = si; i < sellCount; i++) {
            uint256 oid = pendingSellOrderIds[i];
            Order storage o = orders[oid];
            if (o.status == OrderStatus.PENDING) {
                o.status = OrderStatus.REFUNDED;
                baseToken.safeTransfer(o.trader, o.deposit);
                emit OrderRefunded(oid, o.trader, o.deposit);
            }
        }

        // Store settlement
        uint256[] memory trimmedIds = new uint256[](matchedCount);
        for (uint256 i = 0; i < matchedCount; i++) {
            trimmedIds[i] = matchedIds[i];
        }

        settlements[settlementId] = Settlement({
            clearingPrice: clearingPrice,
            matchedVolume: totalMatchedVolume,
            totalTrades: totalTrades,
            timestamp: block.timestamp,
            matchedOrderIds: trimmedIds
        });

        // Clear pending pools
        delete pendingBuyOrderIds;
        delete pendingSellOrderIds;
        totalPendingBuys = 0;
        totalPendingSells = 0;
        totalBuyDeposits = 0;
        totalSellDeposits = 0;
        isMatching = false;

        emit MatchSettled(
            settlementId,
            clearingPrice,
            totalMatchedVolume,
            totalTrades,
            block.timestamp
        );
    }

    // ─── View Functions ───────────────────────────────────────────────

    function getOrder(uint256 _orderId) external view returns (Order memory) {
        return orders[_orderId];
    }

    function getSettlement(uint256 _settlementId) external view returns (
        uint256 clearingPrice,
        uint256 matchedVolume,
        uint256 totalTrades,
        uint256 timestamp
    ) {
        Settlement storage s = settlements[_settlementId];
        return (s.clearingPrice, s.matchedVolume, s.totalTrades, s.timestamp);
    }

    function getUserOrders(address _user) external view returns (uint256[] memory) {
        return userOrders[_user];
    }

    function getPendingBuyOrderIds() external view returns (uint256[] memory) {
        return pendingBuyOrderIds;
    }

    function getPendingSellOrderIds() external view returns (uint256[] memory) {
        return pendingSellOrderIds;
    }

    function getAggregateStats() external view returns (
        uint256 pendingBuys,
        uint256 pendingSells,
        uint256 buyDeposits,
        uint256 sellDeposits,
        uint256 totalSettlements
    ) {
        return (
            totalPendingBuys,
            totalPendingSells,
            totalBuyDeposits,
            totalSellDeposits,
            nextSettlementId
        );
    }

    function getSettlementCount() external view returns (uint256) {
        return nextSettlementId;
    }

    // ─── Internal Helpers ─────────────────────────────────────────────

    function _removePendingOrder(uint256[] storage arr, uint256 orderId) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == orderId) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }

    /// @dev Simple insertion sort descending (for small arrays only)
    function _sortDescending(
        uint256[] storage ids,
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256 len
    ) internal {
        for (uint256 i = 1; i < len; i++) {
            uint256 keyPrice = prices[i];
            uint256 keyAmount = amounts[i];
            uint256 keyId = ids[i];
            uint256 j = i;
            while (j > 0 && prices[j - 1] < keyPrice) {
                prices[j] = prices[j - 1];
                amounts[j] = amounts[j - 1];
                ids[j] = ids[j - 1];
                j--;
            }
            prices[j] = keyPrice;
            amounts[j] = keyAmount;
            ids[j] = keyId;
        }
    }

    /// @dev Simple insertion sort ascending (for small arrays only)
    function _sortAscending(
        uint256[] storage ids,
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256 len
    ) internal {
        for (uint256 i = 1; i < len; i++) {
            uint256 keyPrice = prices[i];
            uint256 keyAmount = amounts[i];
            uint256 keyId = ids[i];
            uint256 j = i;
            while (j > 0 && prices[j - 1] > keyPrice) {
                prices[j] = prices[j - 1];
                amounts[j] = amounts[j - 1];
                ids[j] = ids[j - 1];
                j--;
            }
            prices[j] = keyPrice;
            amounts[j] = keyAmount;
            ids[j] = keyId;
        }
    }

    // Allow contract to receive ETH for CTX gas
    receive() external payable {}
    fallback() external payable {}
}
