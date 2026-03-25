#!/bin/bash
echo "Searching for files containing 'damage_deposit_presets'..."
echo "=========================================================="

# Search in all JavaScript/TypeScript files
find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) \
  -exec grep -l "damage_deposit_presets" {} \; 2>/dev/null

echo ""
echo "Searching for 'forEach' errors..."
echo "=================================="
find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) \
  -exec grep -l "forEach" {} \; 2>/dev/null | head -10
