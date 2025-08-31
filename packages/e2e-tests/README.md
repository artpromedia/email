# E2E Test Setup and Execution Guide

## Prerequisites

1. **Development Server Running**: Ensure webmail is running on `http://localhost:3003`
2. **Playwright Installed**: Run `pnpm install` in the e2e-tests package

## Test Categories

### 🧭 Navigation Tests (`webmail-navigation.spec.ts`)

- Tests all system folders (Inbox, Drafts, Sent, Scheduled, Outbox, Archive, Spam, Trash)
- Tests custom categories and labels
- Tests quarantine functionality
- Tests complete help system with search, categories, and release notes
- Tests all settings tabs with persistence validation

### 🔄 Workflow Tests (`webmail-workflows.spec.ts`)

- **Drafts Workflow**: Open → Edit → Autosave → Schedule → Cancel to Drafts
- **Sent Workflow**: Open Message → Resend → Draft Prefilled
- **Scheduled/Outbox Workflow**: Edit Schedule, Send Now, Retry, Cancel
- **Unread Count Management**: Archive/Delete/Mark Read impact on counts

### 🚨 Console Validation (`webmail-console-validation.spec.ts`)

- Zero console errors during login
- Zero console errors during navigation
- Zero console errors during email operations
- Zero console errors during settings operations
- Zero console errors during help system usage
- Performance metrics validation

## Running Tests

### Local Development

```bash
# Run all comprehensive tests
pnpm test:comprehensive

# Run specific test suites
pnpm test:navigation
pnpm test:workflows
pnpm test:console

# Run with browser visible (debugging)
pnpm test:headed

# Run in debug mode (step through)
pnpm test:debug
```

### CI/Pipeline

```bash
# Full CI suite with JSON output
pnpm run ci
```

## Required Test Data Attributes

The tests require specific `data-testid` attributes on components. Reference `test-ids.ts` for the complete list:

### Critical Attributes Needed:

- `data-testid="mail-shell"` - Main app container
- `data-testid="email-input"` - Login email field
- `data-testid="password-input"` - Login password field
- `data-testid="login-button"` - Login submit button
- `data-testid="folder-*"` - Navigation folder buttons
- `data-testid="compose-*"` - Compose form fields
- `data-testid="help-*"` - Help system elements
- `data-testid="settings-*"` - Settings page elements

## Test Results

Tests generate comprehensive reports:

- **HTML Report**: `playwright-report/index.html`
- **JSON Results**: `test-results/results.json`
- **JUnit XML**: `test-results/junit.xml`
- **Screenshots**: Captured on failures
- **Videos**: Recorded on failures
- **Traces**: Available for retries

## Acceptance Criteria

✅ **All tests pass locally**
✅ **All tests pass in CI**  
✅ **Zero console errors detected**
✅ **Performance thresholds met**
✅ **Navigation between all routes works**
✅ **Email workflows complete successfully**
✅ **Settings persistence verified**
✅ **Unread counts update correctly**

## Troubleshooting

### Common Issues:

1. **Server not running**: Ensure webmail dev server is on port 3003
2. **Missing test IDs**: Add required `data-testid` attributes to components
3. **Console errors**: Check browser console for JavaScript errors
4. **Timing issues**: Tests include appropriate waits and timeouts

### Debug Mode:

```bash
pnpm test:debug
```

This opens the Playwright inspector for step-by-step debugging.

## Browser Support

Tests run on:

- **Desktop Chrome** (primary)
- **Mobile Safari** (responsive validation)
- **CI Environment** (headless Chrome)

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run dev &
      - run: npm run test:comprehensive
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```
