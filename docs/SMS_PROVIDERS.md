# SMS Provider Configuration

This document describes the SMS providers available in the Enterprise Email Platform's SMS Gateway.

## Provider Status

| Provider      | Status           | Description                                |
| ------------- | ---------------- | ------------------------------------------ |
| **Twilio**    | ✅ Supported     | Cloud-based SMS provider with global reach |
| **Vonage**    | ✅ Supported     | Enterprise SMS solution (formerly Nexmo)   |
| **SMPP**      | ❌ Not Supported | Direct carrier connection protocol         |
| **GSM Modem** | ❌ Not Supported | Physical hardware-based SMS                |

## Supported Providers

### Twilio

Twilio is the recommended primary provider for production use.

**Configuration:**

```yaml
providers:
  twilio:
    enabled: true
    priority: 1 # Lower priority = higher preference
    accountSid: "AC..."
    authToken: "your-auth-token"
    fromNumber: "+1234567890"
    messagingServiceSid: "MG..." # Optional
```

**Environment Variables:**

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
TWILIO_MESSAGING_SERVICE_SID=MG...
```

**Features:**

- Global SMS delivery
- Delivery status webhooks
- Message scheduling
- MMS support (US/Canada)
- Number lookup/validation
- Two-way messaging

### Vonage (Nexmo)

Vonage is an alternative cloud provider with strong enterprise features.

**Configuration:**

```yaml
providers:
  vonage:
    enabled: true
    priority: 2
    apiKey: "your-api-key"
    apiSecret: "your-api-secret"
    fromNumber: "+1234567890"
    applicationId: "..." # Optional, for JWT auth
    privateKey: "..." # Optional, for JWT auth
```

**Environment Variables:**

```env
VONAGE_API_KEY=...
VONAGE_API_SECRET=...
VONAGE_FROM_NUMBER=+1234567890
VONAGE_APPLICATION_ID=...
VONAGE_PRIVATE_KEY=...
```

**Features:**

- Global coverage
- Number Insights API
- Delivery receipts
- Unicode messages
- Concatenated messages
- Number verification

## Unsupported Providers

### SMPP (Short Message Peer-to-Peer)

**Status:** ❌ NOT SUPPORTED

SMPP is a protocol for direct connection to carrier SMS centers (SMSCs).

**Why Not Supported:**

1. **Carrier Agreements Required**: SMPP requires business agreements with carriers
2. **Infrastructure Complexity**: Needs dedicated network infrastructure
3. **Limited Cloud Compatibility**: SMPP connections are typically IP-restricted
4. **Better Alternatives**: Cloud providers (Twilio, Vonage) offer:
   - Higher reliability with redundancy
   - Global reach without multiple carrier agreements
   - Easy integration via REST APIs
   - Built-in compliance and deliverability optimization

**If SMPP is Required:**

For organizations requiring direct SMPP connectivity:

1. Use a dedicated SMPP gateway service (e.g., SMSGlobal, Mblox)
2. Deploy a separate SMPP-to-HTTP bridge
3. Consider implementing SMPP using Go libraries:
   - `github.com/fiorix/go-smpp`
   - `github.com/ajankovic/smpp`

**Error When Enabled:**

```json
{
  "success": false,
  "error": {
    "code": "provider_not_supported",
    "message": "SMPP provider is not supported. Use Twilio or Vonage providers instead"
  }
}
```

### GSM Modem

**Status:** ❌ NOT SUPPORTED

GSM modems use physical SIM cards to send SMS via cellular networks.

**Why Not Supported:**

1. **Physical Hardware Required**: Needs actual modem hardware + SIM card
2. **Not Cloud-Compatible**: Cannot be deployed in containerized environments
3. **Scalability Limits**: One modem = one phone number, limited throughput
4. **Carrier Rate Limits**: Consumer SIM cards have daily SMS limits
5. **Maintenance Overhead**: Hardware failures, SIM renewal, etc.

**When GSM Might Be Appropriate:**

- IoT devices with on-premise requirements
- Air-gapped or offline environments
- Development/testing with real carrier networks
- Cost optimization for very low volumes

**If GSM is Required:**

For on-premise deployments requiring GSM modems:

1. Run the SMS gateway on physical hardware
2. Implement using serial port libraries:
   - `github.com/tarm/serial`
   - `go.bug.st/serial`
3. Handle AT commands manually (AT+CMGF, AT+CMGS, etc.)

**Error When Enabled:**

```json
{
  "success": false,
  "error": {
    "code": "provider_not_supported",
    "message": "GSM modem provider is not supported. Use Twilio or Vonage providers instead"
  }
}
```

## Failover Configuration

The SMS Gateway supports automatic failover between providers:

```yaml
providers:
  default: "twilio" # Primary provider
  twilio:
    enabled: true
    priority: 1 # Tried first
  vonage:
    enabled: true
    priority: 2 # Fallback if Twilio fails
```

**Failover Behavior:**

1. Providers are sorted by priority (lowest = highest preference)
2. On send failure, automatically tries next healthy provider
3. Health checks run every 30 seconds
4. Failed providers are temporarily marked unhealthy

## Monitoring

### Provider Status Endpoint

```bash
GET /api/providers/status
```

Response:

```json
{
  "success": true,
  "data": {
    "twilio": true,
    "vonage": true
  }
}
```

### Provider List Endpoint

```bash
GET /api/providers
```

Response:

```json
{
  "success": true,
  "data": ["twilio", "vonage"]
}
```

### Provider Balance Endpoint

```bash
GET /api/providers/balance?provider=twilio
```

Response:

```json
{
  "success": true,
  "data": {
    "provider": "twilio",
    "balance": 150.5,
    "currency": "USD"
  }
}
```

## Troubleshooting

### No Providers Registered

**Symptom:** Log message `No supported SMS providers registered!`

**Cause:** Neither Twilio nor Vonage is enabled in configuration

**Solution:**

1. Enable at least one supported provider in `config.yaml`
2. Ensure API credentials are set correctly
3. Verify environment variables are loaded

### Provider Unhealthy

**Symptom:** Provider shows as unhealthy in status check

**Cause:** Health check failed (API unreachable, invalid credentials)

**Solution:**

1. Verify API credentials
2. Check network connectivity
3. Review provider logs for specific errors

### SMPP/GSM Enabled Warning

**Symptom:** Error log `SMPP/GSM provider is enabled in configuration but NOT SUPPORTED`

**Cause:** Config file has `smpp.enabled: true` or `gsm.enabled: true`

**Solution:**

1. Disable unsupported providers in config
2. Use Twilio or Vonage instead
3. If SMPP/GSM is required, see implementation notes above

## Best Practices

1. **Enable Multiple Providers**: Configure both Twilio and Vonage for redundancy
2. **Set Proper Priorities**: Assign priorities based on cost/reliability preference
3. **Monitor Health**: Set up alerting on provider health status
4. **Use Webhooks**: Configure delivery status webhooks for tracking
5. **Test Failover**: Regularly test failover by temporarily disabling primary provider
