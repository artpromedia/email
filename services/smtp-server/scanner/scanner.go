package scanner

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

var (
	// ErrVirusFound indicates a virus was detected
	ErrVirusFound = errors.New("virus found")
	// ErrScanFailed indicates the scan operation failed
	ErrScanFailed = errors.New("scan failed")
	// ErrConnectionFailed indicates connection to clamd failed
	ErrConnectionFailed = errors.New("connection to clamd failed")
	// ErrScannerDisabled indicates the scanner is not enabled
	ErrScannerDisabled = errors.New("virus scanner is disabled")
)

// Config holds the ClamAV scanner configuration
type Config struct {
	Enabled         bool          `yaml:"enabled"`
	Address         string        `yaml:"address"`         // clamd socket address (unix:/var/run/clamav/clamd.sock or tcp://127.0.0.1:3310)
	ConnectionPool  int           `yaml:"connection_pool"` // number of connections to maintain
	Timeout         time.Duration `yaml:"timeout"`         // scan timeout
	MaxSize         int64         `yaml:"max_size"`        // max file size to scan (bytes)
	ScanOnReceive   bool          `yaml:"scan_on_receive"` // scan messages when received via SMTP
	ScanOnDelivery  bool          `yaml:"scan_on_delivery"` // scan messages before final delivery
	RejectInfected  bool          `yaml:"reject_infected"` // reject messages with viruses
	QuarantineDir   string        `yaml:"quarantine_dir"`  // directory to store infected messages
}

// ScanResult contains the result of a virus scan
type ScanResult struct {
	Clean       bool     `json:"clean"`
	Infected    bool     `json:"infected"`
	VirusNames  []string `json:"virus_names,omitempty"`
	Error       error    `json:"error,omitempty"`
	ScanTime    time.Duration `json:"scan_time"`
	FileSize    int64    `json:"file_size"`
}

// Scanner provides virus scanning using ClamAV
type Scanner struct {
	config     *Config
	logger     *zap.Logger
	pool       chan net.Conn
	poolMu     sync.Mutex
	network    string
	address    string
}

// NewScanner creates a new ClamAV scanner
func NewScanner(config *Config, logger *zap.Logger) (*Scanner, error) {
	if !config.Enabled {
		return &Scanner{config: config, logger: logger}, nil
	}

	// Parse address
	network, address := parseAddress(config.Address)

	s := &Scanner{
		config:  config,
		logger:  logger,
		network: network,
		address: address,
	}

	// Initialize connection pool
	if config.ConnectionPool > 0 {
		s.pool = make(chan net.Conn, config.ConnectionPool)
		// Pre-warm pool with one connection to verify connectivity
		conn, err := s.connect()
		if err != nil {
			logger.Warn("Failed to connect to clamd during initialization",
				zap.Error(err),
				zap.String("address", config.Address))
		} else {
			s.releaseConn(conn)
		}
	}

	logger.Info("ClamAV scanner initialized",
		zap.String("address", config.Address),
		zap.Int("pool_size", config.ConnectionPool),
		zap.Duration("timeout", config.Timeout))

	return s, nil
}

// parseAddress parses clamd address into network type and address
func parseAddress(addr string) (string, string) {
	if strings.HasPrefix(addr, "unix:") {
		return "unix", strings.TrimPrefix(addr, "unix:")
	}
	if strings.HasPrefix(addr, "tcp://") {
		return "tcp", strings.TrimPrefix(addr, "tcp://")
	}
	// Default to unix socket
	return "unix", addr
}

// IsEnabled returns whether the scanner is enabled
func (s *Scanner) IsEnabled() bool {
	return s.config.Enabled
}

// Scan scans data for viruses
func (s *Scanner) Scan(ctx context.Context, data []byte) (*ScanResult, error) {
	return s.ScanReader(ctx, bytes.NewReader(data), int64(len(data)))
}

// ScanReader scans data from a reader for viruses
func (s *Scanner) ScanReader(ctx context.Context, reader io.Reader, size int64) (*ScanResult, error) {
	if !s.config.Enabled {
		return &ScanResult{Clean: true}, nil
	}

	startTime := time.Now()
	result := &ScanResult{FileSize: size}

	// Check size limit
	if s.config.MaxSize > 0 && size > s.config.MaxSize {
		s.logger.Debug("Skipping scan, file too large",
			zap.Int64("size", size),
			zap.Int64("max_size", s.config.MaxSize))
		result.Clean = true
		result.ScanTime = time.Since(startTime)
		return result, nil
	}

	// Get connection
	conn, err := s.getConn(ctx)
	if err != nil {
		result.Error = err
		return result, err
	}
	defer s.releaseConn(conn)

	// Set deadline
	if s.config.Timeout > 0 {
		conn.SetDeadline(time.Now().Add(s.config.Timeout))
	}

	// Send INSTREAM command for streaming scan
	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		result.Error = fmt.Errorf("failed to send command: %w", err)
		return result, result.Error
	}

	// Stream data in chunks
	// ClamAV INSTREAM format: 4-byte big-endian length followed by data, terminated by 0-length chunk
	chunkSize := 8192
	buf := make([]byte, chunkSize)
	lengthBuf := make([]byte, 4)

	for {
		n, readErr := reader.Read(buf)
		if n > 0 {
			// Send chunk length (big-endian)
			lengthBuf[0] = byte(n >> 24)
			lengthBuf[1] = byte(n >> 16)
			lengthBuf[2] = byte(n >> 8)
			lengthBuf[3] = byte(n)

			if _, err := conn.Write(lengthBuf); err != nil {
				result.Error = fmt.Errorf("failed to send chunk length: %w", err)
				return result, result.Error
			}
			if _, err := conn.Write(buf[:n]); err != nil {
				result.Error = fmt.Errorf("failed to send chunk data: %w", err)
				return result, result.Error
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			result.Error = fmt.Errorf("failed to read data: %w", readErr)
			return result, result.Error
		}
	}

	// Send terminating 0-length chunk
	if _, err := conn.Write([]byte{0, 0, 0, 0}); err != nil {
		result.Error = fmt.Errorf("failed to send terminator: %w", err)
		return result, result.Error
	}

	// Read response
	scanner := bufio.NewScanner(conn)
	if scanner.Scan() {
		response := strings.TrimSpace(scanner.Text())
		response = strings.TrimSuffix(response, "\x00") // Remove null terminator

		result.ScanTime = time.Since(startTime)

		// Parse response
		// Format: "stream: OK" or "stream: VirusName FOUND"
		if strings.HasSuffix(response, "OK") {
			result.Clean = true
			s.logger.Debug("Scan completed - clean",
				zap.Duration("duration", result.ScanTime),
				zap.Int64("size", size))
		} else if strings.Contains(response, "FOUND") {
			result.Infected = true
			// Extract virus name
			parts := strings.Split(response, ":")
			if len(parts) >= 2 {
				virusPart := strings.TrimSpace(parts[1])
				virusName := strings.TrimSuffix(virusPart, " FOUND")
				result.VirusNames = []string{virusName}
			}
			s.logger.Warn("Virus detected",
				zap.Strings("viruses", result.VirusNames),
				zap.Duration("duration", result.ScanTime),
				zap.Int64("size", size))
		} else if strings.Contains(response, "ERROR") {
			result.Error = fmt.Errorf("clamd error: %s", response)
			s.logger.Error("Scan error",
				zap.String("response", response),
				zap.Duration("duration", result.ScanTime))
		}
	}

	if err := scanner.Err(); err != nil {
		result.Error = fmt.Errorf("failed to read response: %w", err)
		return result, result.Error
	}

	return result, nil
}

// Ping checks if clamd is reachable
func (s *Scanner) Ping(ctx context.Context) error {
	if !s.config.Enabled {
		return ErrScannerDisabled
	}

	conn, err := s.getConn(ctx)
	if err != nil {
		return err
	}
	defer s.releaseConn(conn)

	// Set deadline
	if s.config.Timeout > 0 {
		conn.SetDeadline(time.Now().Add(s.config.Timeout))
	}

	// Send PING command
	if _, err := conn.Write([]byte("zPING\x00")); err != nil {
		return fmt.Errorf("failed to send PING: %w", err)
	}

	// Read response
	buf := make([]byte, 64)
	n, err := conn.Read(buf)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	response := strings.TrimSpace(string(buf[:n]))
	response = strings.TrimSuffix(response, "\x00")

	if response != "PONG" {
		return fmt.Errorf("unexpected response: %s", response)
	}

	return nil
}

// Version returns the ClamAV version
func (s *Scanner) Version(ctx context.Context) (string, error) {
	if !s.config.Enabled {
		return "", ErrScannerDisabled
	}

	conn, err := s.getConn(ctx)
	if err != nil {
		return "", err
	}
	defer s.releaseConn(conn)

	// Set deadline
	if s.config.Timeout > 0 {
		conn.SetDeadline(time.Now().Add(s.config.Timeout))
	}

	// Send VERSION command
	if _, err := conn.Write([]byte("zVERSION\x00")); err != nil {
		return "", fmt.Errorf("failed to send VERSION: %w", err)
	}

	// Read response
	scanner := bufio.NewScanner(conn)
	if scanner.Scan() {
		response := strings.TrimSpace(scanner.Text())
		response = strings.TrimSuffix(response, "\x00")
		return response, nil
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	return "", errors.New("no response from clamd")
}

// Stats returns ClamAV statistics
func (s *Scanner) Stats(ctx context.Context) (string, error) {
	if !s.config.Enabled {
		return "", ErrScannerDisabled
	}

	conn, err := s.getConn(ctx)
	if err != nil {
		return "", err
	}
	defer s.releaseConn(conn)

	// Set deadline
	if s.config.Timeout > 0 {
		conn.SetDeadline(time.Now().Add(s.config.Timeout))
	}

	// Send STATS command
	if _, err := conn.Write([]byte("zSTATS\x00")); err != nil {
		return "", fmt.Errorf("failed to send STATS: %w", err)
	}

	// Read response (may be multiple lines)
	var result strings.Builder
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			break
		}
		result.WriteString(line)
		result.WriteString("\n")
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	return strings.TrimSpace(result.String()), nil
}

// connect creates a new connection to clamd
func (s *Scanner) connect() (net.Conn, error) {
	conn, err := net.DialTimeout(s.network, s.address, s.config.Timeout)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrConnectionFailed, err)
	}
	return conn, nil
}

// getConn gets a connection from pool or creates a new one
func (s *Scanner) getConn(ctx context.Context) (net.Conn, error) {
	// Try to get from pool first
	select {
	case conn := <-s.pool:
		// Verify connection is still good
		conn.SetDeadline(time.Now().Add(100 * time.Millisecond))
		if _, err := conn.Write([]byte("zPING\x00")); err == nil {
			buf := make([]byte, 8)
			if _, err := conn.Read(buf); err == nil {
				conn.SetDeadline(time.Time{}) // Reset deadline
				return conn, nil
			}
		}
		// Connection is stale, close and create new
		conn.Close()
	default:
		// Pool empty
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	return s.connect()
}

// releaseConn returns a connection to the pool
func (s *Scanner) releaseConn(conn net.Conn) {
	if conn == nil {
		return
	}

	select {
	case s.pool <- conn:
		// Returned to pool
	default:
		// Pool full, close connection
		conn.Close()
	}
}

// Close closes the scanner and all connections
func (s *Scanner) Close() error {
	if s.pool != nil {
		close(s.pool)
		for conn := range s.pool {
			conn.Close()
		}
	}
	return nil
}
