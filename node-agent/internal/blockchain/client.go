package blockchain

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"

	"github.com/x402/node-agent/internal/bindings"
)

// Client wraps Ethereum client functionality
type Client struct {
	client           *ethclient.Client
	sessionManager   common.Address
	nodeAddress      common.Address
	nodePrivateKey   string
	transactOpts     *bind.TransactOpts
	logger           *zap.Logger
	retryMax         int
	retryDelay       time.Duration
}

// NewClient creates a new blockchain client
func NewClient(rpcURL, sessionManagerAddr, nodePrivateKey string, retryMax int, retryDelay time.Duration, logger *zap.Logger) (*Client, error) {
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum client: %w", err)
	}

	// Derive node address from private key
	privateKey, err := crypto.HexToECDSA(nodePrivateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}
	nodeAddress := crypto.PubkeyToAddress(privateKey.PublicKey)

	// Create transaction options
	chainID, err := client.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to create transactor: %w", err)
	}

	return &Client{
		client:         client,
		sessionManager: common.HexToAddress(sessionManagerAddr),
		nodeAddress:    nodeAddress,
		nodePrivateKey: nodePrivateKey,
		transactOpts:   auth,
		logger:         logger,
		retryMax:       retryMax,
		retryDelay:     retryDelay,
	}, nil
}

// SubscribeToEvents subscribes to contract events
func (bc *Client) SubscribeToEvents(ctx context.Context, nodeID *big.Int) (<-chan *bindings.SessionStarted, <-chan *bindings.SessionSettled, <-chan *bindings.SessionStopped, ethereum.Subscription, error) {
	// Create filter queries for our node's events
	sessionStartedQuery := ethereum.FilterQuery{
		Addresses: []common.Address{bc.sessionManager},
		Topics: [][]common.Hash{
			{crypto.Keccak256Hash([]byte("SessionStarted(bytes32,address,uint256,uint256,uint256,uint256)"))},
			nil, // User address (any)
			{big.NewHash(nodeID)},
		},
	}

	sessionSettledQuery := ethereum.FilterQuery{
		Addresses: []common.Address{bc.sessionManager},
		Topics: [][]common.Hash{
			{crypto.Keccak256Hash([]byte("SessionSettled(bytes32,uint256,uint256,uint256,uint256)"))},
		},
	}

	sessionStoppedQuery := ethereum.FilterQuery{
		Addresses: []common.Address{bc.sessionManager},
		Topics: [][]common.Hash{
			{crypto.Keccak256Hash([]byte("SessionStopped(bytes32,uint256)"))},
		},
	}

	// Subscribe to logs
	logs := make(chan types.Log)
	sub, err := bc.client.SubscribeFilterLogs(ctx, sessionStartedQuery, logs)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("failed to subscribe to events: %w", err)
	}

	// Create channels for different event types
	sessionStartedCh := make(chan *bindings.SessionStarted, 100)
	sessionSettledCh := make(chan *bindings.SessionSettled, 100)
	sessionStoppedCh := make(chan *bindings.SessionStopped, 100)

	// Start goroutine to process logs
	go func() {
		defer close(sessionStartedCh)
		defer close(sessionSettledCh)
		defer close(sessionStoppedCh)

		for {
			select {
			case err := <-sub.Err():
				bc.logger.Error("subscription error", zap.Error(err))
				return
			case log := <-logs:
				if err := bc.processLog(log, sessionStartedCh, sessionSettledCh, sessionStoppedCh); err != nil {
					bc.logger.Error("failed to process log", zap.Error(err), zap.String("tx_hash", log.TxHash.Hex()))
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	return sessionStartedCh, sessionSettledCh, sessionStoppedCh, sub, nil
}

// processLog processes a single log and routes it to the appropriate channel
func (bc *Client) processLog(log types.Log, startedCh chan<- *bindings.SessionStarted, settledCh chan<- *bindings.SessionSettled, stoppedCh chan<- *bindings.SessionStopped) error {
	if len(log.Topics) == 0 {
		return fmt.Errorf("log has no topics")
	}

	eventSignature := log.Topics[0]
	
	switch eventSignature {
	case crypto.Keccak256Hash([]byte("SessionStarted(bytes32,address,uint256,uint256,uint256,uint256)")):
		return bc.processSessionStarted(log, startedCh)
	case crypto.Keccak256Hash([]byte("SessionSettled(bytes32,uint256,uint256,uint256,uint256)")):
		return bc.processSessionSettled(log, settledCh)
	case crypto.Keccak256Hash([]byte("SessionStopped(bytes32,uint256)")):
		return bc.processSessionStopped(log, stoppedCh)
	default:
		bc.logger.Debug("unknown event signature", zap.String("signature", eventSignature.Hex()))
		return nil
	}
}

// processSessionStarted processes a SessionStarted event
func (bc *Client) processSessionStarted(log types.Log, ch chan<- *bindings.SessionStarted) error {
	if len(log.Topics) < 4 {
		return fmt.Errorf("invalid SessionStarted log: insufficient topics")
	}

	event := &bindings.SessionStarted{
		SessionId: log.Topics[1],
		User:      common.BytesToAddress(log.Topics[2].Bytes()),
	}

	if err := bindings.ParsedSessionManagerABI.UnpackIntoInterface(event, "SessionStarted", log.Data); err != nil {
		return fmt.Errorf("failed to unpack SessionStarted event: %w", err)
	}

	select {
	case ch <- event:
	default:
		bc.logger.Warn("session started channel full, dropping event", zap.String("session_id", event.SessionId.Hex()))
	}

	return nil
}

// processSessionSettled processes a SessionSettled event
func (bc *Client) processSessionSettled(log types.Log, ch chan<- *bindings.SessionSettled) error {
	if len(log.Topics) < 2 {
		return fmt.Errorf("invalid SessionSettled log: insufficient topics")
	}

	event := &bindings.SessionSettled{
		SessionId: log.Topics[1],
	}

	if err := bindings.ParsedSessionManagerABI.UnpackIntoInterface(event, "SessionSettled", log.Data); err != nil {
		return fmt.Errorf("failed to unpack SessionSettled event: %w", err)
	}

	select {
	case ch <- event:
	default:
		bc.logger.Warn("session settled channel full, dropping event", zap.String("session_id", event.SessionId.Hex()))
	}

	return nil
}

// processSessionStopped processes a SessionStopped event
func (bc *Client) processSessionStopped(log types.Log, ch chan<- *bindings.SessionStopped) error {
	if len(log.Topics) < 2 {
		return fmt.Errorf("invalid SessionStopped log: insufficient topics")
	}

	event := &bindings.SessionStopped{
		SessionId: log.Topics[1],
	}

	if err := bindings.ParsedSessionManagerABI.UnpackIntoInterface(event, "SessionStopped", log.Data); err != nil {
		return fmt.Errorf("failed to unpack SessionStopped event: %w", err)
	}

	select {
	case ch <- event:
	default:
		bc.logger.Warn("session stopped channel full, dropping event", zap.String("session_id", event.SessionId.Hex()))
	}

	return nil
}

// SettleSession calls the settleSession function
func (bc *Client) SettleSession(ctx context.Context, sessionID [32]byte) (*types.Transaction, error) {
	var lastErr error
	
	for attempt := 0; attempt < bc.retryMax; attempt++ {
		if attempt > 0 {
			bc.logger.Info("retrying settle session", 
				zap.String("session_id", fmt.Sprintf("%x", sessionID)), 
				zap.Int("attempt", attempt+1))
			
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(bc.retryDelay * time.Duration(attempt)):
			}
		}

		// Get fresh gas price
		gasPrice, err := bc.client.SuggestGasPrice(ctx)
		if err != nil {
			lastErr = fmt.Errorf("failed to get gas price: %w", err)
			continue
		}

		bc.transactOpts.GasPrice = gasPrice
		bc.transactOpts.Context = ctx

		// Pack the function call
		data, err := bindings.ParsedSessionManagerABI.Pack("settleSession", sessionID)
		if err != nil {
			lastErr = fmt.Errorf("failed to pack settleSession: %w", err)
			continue
		}

		// Estimate gas
		msg := ethereum.CallMsg{
			From:  bc.nodeAddress,
			To:    &bc.sessionManager,
			Data:  data,
			Value: big.NewInt(0),
		}

		gasLimit, err := bc.client.EstimateGas(ctx, msg)
		if err != nil {
			lastErr = fmt.Errorf("failed to estimate gas: %w", err)
			continue
		}

		bc.transactOpts.GasLimit = gasLimit

		// Send transaction
		tx, err := bind.Transact(bc.transactOpts, bc.client, bc.sessionManager, data)
		if err != nil {
			lastErr = fmt.Errorf("failed to send transaction: %w", err)
			continue
		}

		bc.logger.Info("sent settle transaction",
			zap.String("session_id", fmt.Sprintf("%x", sessionID)),
			zap.String("tx_hash", tx.Hash().Hex()),
			zap.Uint64("gas_limit", gasLimit),
			zap.String("gas_price", gasPrice.String()))

		return tx, nil
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", bc.retryMax, lastErr)
}

// WaitForTransaction waits for a transaction to be mined
func (bc *Client) WaitForTransaction(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
	var lastErr error
	
	for attempt := 0; attempt < bc.retryMax; attempt++ {
		if attempt > 0 {
			bc.logger.Debug("waiting for transaction", 
				zap.String("tx_hash", txHash.Hex()), 
				zap.Int("attempt", attempt+1))
			
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(bc.retryDelay):
			}
		}

		receipt, err := bc.client.TransactionReceipt(ctx, txHash)
		if err != nil {
			if err == ethereum.NotFound {
				lastErr = fmt.Errorf("transaction not found: %s", txHash.Hex())
				continue
			}
			lastErr = fmt.Errorf("failed to get receipt: %w", err)
			continue
		}

		return receipt, nil
	}

	return nil, fmt.Errorf("transaction not confirmed after %d attempts: %w", bc.retryMax, lastErr)
}

// Close closes the client connection
func (bc *Client) Close() {
	if bc.client != nil {
		bc.client.Close()
	}
}