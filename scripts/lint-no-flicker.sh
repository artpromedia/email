#!/bin/bash

# CI Script to enforce no-hash-href lint rule
# This script will block CI if any anchor tags with href="#" are found

set -e

echo "🔍 Running lint checks to prevent static buttons and flicker..."

# Run ESLint with the custom rule
echo "📝 Checking for anchor tags with href='#'..."
npx eslint "apps/**/*.{ts,tsx,js,jsx}" "packages/**/*.{ts,tsx,js,jsx}" \
  --config packages/config/eslint.config.js \
  --rule "custom/no-hash-href: error"

# Check for any remaining href="#" patterns in files
echo "🔎 Scanning for any remaining href='#' patterns..."
HASH_HREF_COUNT=$(grep -r "href=[\"']#[\"']" apps/ packages/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" | wc -l || echo "0")

if [ "$HASH_HREF_COUNT" -gt 0 ]; then
  echo "❌ Found $HASH_HREF_COUNT instances of href='#' in the codebase:"
  grep -r "href=[\"']#[\"']" apps/ packages/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" -n
  echo ""
  echo "🚫 CI blocked: Static anchor buttons with href='#' are not allowed."
  echo "💡 Use <button> elements for interactive elements that don't navigate."
  echo "💡 Use React Router's Link or useNavigate for navigation."
  exit 1
fi

# Also check for onClick handlers on anchor tags without proper href
echo "🔍 Checking for anchor tags with onClick but no proper href..."
ONCLICK_ANCHOR_COUNT=$(grep -r "<a[^>]*onClick[^>]*>" apps/ packages/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" | grep -v "href=" | wc -l || echo "0")

if [ "$ONCLICK_ANCHOR_COUNT" -gt 0 ]; then
  echo "⚠️  Found $ONCLICK_ANCHOR_COUNT anchor tags with onClick but no href:"
  grep -r "<a[^>]*onClick[^>]*>" apps/ packages/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" | grep -v "href=" -n
  echo ""
  echo "💡 Consider using <button> elements instead of <a> tags for non-navigation interactions."
fi

echo "✅ No static anchor buttons found - CI check passed!"

# Run the regular lint check
echo "📋 Running full ESLint check..."
npx eslint "apps/**/*.{ts,tsx,js,jsx}" "packages/**/*.{ts,tsx,js,jsx}" \
  --config packages/config/eslint.config.js

echo "🎉 All lint checks passed!"
