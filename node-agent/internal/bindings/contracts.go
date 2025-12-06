package bindings

import (
    "context"
    "math/big"
    "strings"

    "github.com/ethereum/go-ethereum"
    "github.com/ethereum/go-ethereum/accounts/abi"
    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/core/types"
    "github.com/ethereum/go-ethereum/event"
)

// SessionManagerABI is the ABI for the SessionManager contract
var SessionManagerABI = `[{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"sessionId","type":"bytes32"},{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"uint256","name":"nodeId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"rate","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"maxSpend","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"deposited","type":"uint256"}],"name":"SessionStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"sessionId","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"elapsed","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"cost","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"protocolFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"nodeEarning","type":"uint256"}],"name":"SessionSettled","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"sessionId","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"refund","type":"uint256"}],"name":"SessionStopped","type":"event"}]`

// NodeRegistryABI is the ABI for the NodeRegistry contract
var NodeRegistryABI = `[{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"nodeId","type":"uint256"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"string","name":"endpoint","type":"string"},{"indexed":false,"internalType":"uint256","name":"rate","type":"uint256"}],"name":"NodeRegistered","type":"event"}]`

// Parsed ABIs
var (
    ParsedSessionManagerABI abi.ABI
    ParsedNodeRegistryABI  abi.ABI
)

func init() {
    var err error
    
    ParsedSessionManagerABI, err = abi.JSON(strings.NewReader(SessionManagerABI))
    if err != nil {
        panic(err)
    }
    
    ParsedNodeRegistryABI, err = abi.JSON(strings.NewReader(NodeRegistryABI))
    if err != nil {
        panic(err)
    }
}

// SessionStarted represents a SessionStarted event
type SessionStarted struct {
    SessionId [32]byte
    User      common.Address
    NodeId    *big.Int
    Rate      *big.Int
    MaxSpend  *big.Int
    Deposited *big.Int
}

// SessionSettled represents a SessionSettled event
type SessionSettled struct {
    SessionId  [32]byte
    Elapsed    *big.Int
    Cost       *big.Int
    ProtocolFee *big.Int
    NodeEarning *big.Int
}

// SessionStopped represents a SessionStopped event
type SessionStopped struct {
    SessionId [32]byte
    Refund    *big.Int
}

// Contract interface defines the methods we need
type Contract interface {
    FilterSessionStarted(opts *bind.FilterOpts, nodeId []*big.Int) (*SessionStartedIterator, error)
    FilterSessionSettled(opts *bind.FilterOpts, sessionId [][32]byte) (*SessionSettledIterator, error)
    FilterSessionStopped(opts *bind.FilterOpts, sessionId [][32]byte) (*SessionStoppedIterator, error)
    SettleSession(opts *bind.TransactOpts, sessionId [32]byte) (*types.Transaction, error)
}

// SessionStartedIterator wraps the go-ethereum iterator
type SessionStartedIterator struct {
    Event *SessionStarted
    Events []types.Log
    current int
}

func (it *SessionStartedIterator) Next() bool {
    if it.current >= len(it.Events) {
        return false
    }
    
    event := it.Events[it.current]
    it.current++
    
    // Parse the event
    if len(event.Topics) >= 4 {
        it.Event = &SessionStarted{
            SessionId: event.Topics[1],
            User:      common.BytesToAddress(event.Topics[2].Bytes()),
        }
        
        if err := ParsedSessionManagerABI.UnpackIntoInterface(it.Event, "SessionStarted", event.Data); err != nil {
            return false
        }
    }
    
    return true
}

func (it *SessionStartedIterator) Error() error {
    return nil
}

func (it *SessionStartedIterator) Close() error {
    return nil
}

// SessionSettledIterator wraps the go-ethereum iterator
type SessionSettledIterator struct {
    Event *SessionSettled
    Events []types.Log
    current int
}

func (it *SessionSettledIterator) Next() bool {
    if it.current >= len(it.Events) {
        return false
    }
    
    event := it.Events[it.current]
    it.current++
    
    // Parse the event
    if len(event.Topics) >= 2 {
        it.Event = &SessionSettled{
            SessionId: event.Topics[1],
        }
        
        if err := ParsedSessionManagerABI.UnpackIntoInterface(it.Event, "SessionSettled", event.Data); err != nil {
            return false
        }
    }
    
    return true
}

func (it *SessionSettledIterator) Error() error {
    return nil
}

func (it *SessionSettledIterator) Close() error {
    return nil
}

// SessionStoppedIterator wraps the go-ethereum iterator
type SessionStoppedIterator struct {
    Event *SessionStopped
    Events []types.Log
    current int
}

func (it *SessionStoppedIterator) Next() bool {
    if it.current >= len(it.Events) {
        return false
    }
    
    event := it.Events[it.current]
    it.current++
    
    // Parse the event
    if len(event.Topics) >= 2 {
        it.Event = &SessionStopped{
            SessionId: event.Topics[1],
        }
        
        if err := ParsedSessionManagerABI.UnpackIntoInterface(it.Event, "SessionStopped", event.Data); err != nil {
            return false
        }
    }
    
    return true
}

func (it *SessionStoppedIterator) Error() error {
    return nil
}

func (it *SessionStoppedIterator) Close() error {
    return nil
}

// Backend interface for Ethereum client
type Backend interface {
    SubscribeFilterLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error)
    FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error)
    TransactionReceipt(ctx context.Context, txHash common.Hash) (*types.Receipt, error)
    CodeAt(ctx context.Context, account common.Address, blockNumber *big.Int) ([]byte, error)
}