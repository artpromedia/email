package dsn

import (
	"bytes"
	"fmt"
	"text/template"
	"time"
)

// Generator creates RFC 3464 compliant DSN messages
type Generator struct {
	hostname string
}

// NewGenerator creates a new DSN generator
func NewGenerator(hostname string) *Generator {
	return &Generator{hostname: hostname}
}

// dsnTemplate is the RFC 3464 compliant DSN template
var dsnTemplate = template.Must(template.New("dsn").Parse(`From: Mail Delivery System <MAILER-DAEMON@{{.Hostname}}>
To: {{.OriginalSender}}
Subject: {{.Subject}}
Date: {{.Date}}
Message-ID: <{{.MessageID}}@{{.Hostname}}>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status;
	boundary="{{.Boundary}}"
Auto-Submitted: auto-replied
X-Original-Message-ID: {{.OriginalMessageID}}

This is a MIME-encapsulated message.

--{{.Boundary}}
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 7bit

This is the mail system at host {{.Hostname}}.

{{if eq .Action "failed"}}I'm sorry to have to inform you that your message could not
be delivered to one or more recipients. It's attached below.

For further assistance, please send mail to postmaster@{{.Hostname}}.

If you do so, please include this problem report.
{{else if eq .Action "delayed"}}This is a delivery status notification.

Your message has not yet been delivered to the following recipients
due to a temporary error:

Delivery will continue to be attempted.
{{end}}
                   The mail system

{{range .Recipients}}
<{{.Address}}>: {{.DiagnosticCode}}
    Status: {{.Status}}{{if .RemoteMTA}}
    Remote-MTA: {{.RemoteMTA}}{{end}}
{{end}}

--{{.Boundary}}
Content-Type: message/delivery-status

Reporting-MTA: dns; {{.Hostname}}
{{if .EnvelopeID}}Original-Envelope-ID: {{.EnvelopeID}}
{{end}}Arrival-Date: {{.ArrivalDate}}

{{range .Recipients}}Final-Recipient: rfc822; {{.Address}}
Action: {{.Action}}
Status: {{.Status}}
{{if .RemoteMTA}}Remote-MTA: dns; {{.RemoteMTA}}
{{end}}{{if .DiagnosticCode}}Diagnostic-Code: smtp; {{.DiagnosticCode}}
{{end}}{{if .LastAttempt}}Last-Attempt-Date: {{.LastAttempt}}
{{end}}{{if .WillRetryUntil}}Will-Retry-Until: {{.WillRetryUntil}}
{{end}}
{{end}}
--{{.Boundary}}
Content-Type: {{.OriginalContentType}}
Content-Disposition: inline

{{.OriginalContent}}
--{{.Boundary}}--
`))

// templateData holds the data for DSN template rendering
type templateData struct {
	Hostname           string
	OriginalSender     string
	Subject            string
	Date               string
	MessageID          string
	Boundary           string
	OriginalMessageID  string
	Action             string
	EnvelopeID         string
	ArrivalDate        string
	Recipients         []recipientData
	OriginalContentType string
	OriginalContent    string
}

type recipientData struct {
	Address        string
	Action         string
	Status         string
	RemoteMTA      string
	DiagnosticCode string
	LastAttempt    string
	WillRetryUntil string
}

// GenerateOptions contains options for DSN generation
type GenerateOptions struct {
	// OriginalSender is the return path from the original message
	OriginalSender string

	// OriginalMessageID is the Message-ID from the original message
	OriginalMessageID string

	// OriginalEnvelopeID is the ENVID from MAIL FROM (if any)
	OriginalEnvelopeID string

	// ArrivalDate is when the original message was received
	ArrivalDate time.Time

	// Recipients contains the status for each failed recipient
	Recipients []RecipientStatus

	// OriginalHeaders contains headers from the original message
	OriginalHeaders string

	// OriginalMessage contains the full message (optional, for small messages)
	OriginalMessage []byte

	// IncludeFullMessage indicates whether to include the full original message
	// If false, only headers are included
	IncludeFullMessage bool

	// MaxOriginalSize is the maximum size of original content to include
	// Defaults to 50KB
	MaxOriginalSize int
}

// Generate creates a DSN message from the given report
func (g *Generator) Generate(opts GenerateOptions) ([]byte, error) {
	now := time.Now()

	// Determine the action based on recipients
	action := "failed"
	for _, r := range opts.Recipients {
		if r.Action == ActionDelayed {
			action = "delayed"
			break
		}
	}

	// Build subject
	subject := "Undelivered Mail Returned to Sender"
	if action == "delayed" {
		subject = "Delayed Mail (still being retried)"
	}

	// Build recipient data
	var recipients []recipientData
	for _, r := range opts.Recipients {
		rd := recipientData{
			Address:        r.FinalRecipient,
			Action:         string(r.Action),
			Status:         r.Status,
			RemoteMTA:      r.RemoteMTA,
			DiagnosticCode: r.DiagnosticCode,
		}
		if !r.LastAttemptDate.IsZero() {
			rd.LastAttempt = r.LastAttemptDate.Format(time.RFC1123Z)
		}
		if r.WillRetryUntil != nil {
			rd.WillRetryUntil = r.WillRetryUntil.Format(time.RFC1123Z)
		}
		recipients = append(recipients, rd)
	}

	// Determine what original content to include
	maxSize := opts.MaxOriginalSize
	if maxSize == 0 {
		maxSize = 50 * 1024 // 50KB default
	}

	originalContentType := "message/rfc822"
	var originalContent string

	if opts.IncludeFullMessage && len(opts.OriginalMessage) > 0 && len(opts.OriginalMessage) <= maxSize {
		originalContent = string(opts.OriginalMessage)
	} else if opts.OriginalHeaders != "" {
		originalContentType = "text/rfc822-headers"
		originalContent = opts.OriginalHeaders
	} else {
		originalContentType = "text/plain"
		originalContent = "(original message headers not available)"
	}

	// Build template data
	data := templateData{
		Hostname:            g.hostname,
		OriginalSender:      opts.OriginalSender,
		Subject:             subject,
		Date:                now.Format(time.RFC1123Z),
		MessageID:           fmt.Sprintf("dsn-%d.%d", now.UnixNano(), now.Unix()),
		Boundary:            fmt.Sprintf("----=_Part_DSN_%d_%d", now.UnixNano(), now.Unix()),
		OriginalMessageID:   opts.OriginalMessageID,
		Action:              action,
		EnvelopeID:          opts.OriginalEnvelopeID,
		ArrivalDate:         opts.ArrivalDate.Format(time.RFC1123Z),
		Recipients:          recipients,
		OriginalContentType: originalContentType,
		OriginalContent:     originalContent,
	}

	// Render template
	var buf bytes.Buffer
	if err := dsnTemplate.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("render DSN template: %w", err)
	}

	return buf.Bytes(), nil
}

// GenerateDelayedDSN creates a DSN for a delayed message (will continue retrying)
func (g *Generator) GenerateDelayedDSN(opts GenerateOptions) ([]byte, error) {
	// Mark all recipients as delayed
	for i := range opts.Recipients {
		opts.Recipients[i].Action = ActionDelayed
	}
	return g.Generate(opts)
}

// GenerateFailedDSN creates a DSN for a permanently failed message
func (g *Generator) GenerateFailedDSN(opts GenerateOptions) ([]byte, error) {
	// Mark all recipients as failed
	for i := range opts.Recipients {
		opts.Recipients[i].Action = ActionFailed
	}
	return g.Generate(opts)
}
