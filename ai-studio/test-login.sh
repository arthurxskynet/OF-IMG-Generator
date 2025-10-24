#!/bin/bash

# Test Login Script
# Run this AFTER running the SQL fixes to verify authentication works

echo "=== Testing User Authentication ==="
echo ""

# Test working user (should still work)
echo "1. Testing working user (passarthur2003@icloud.com)..."
WORKING_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"passarthur2003@icloud.com","password":"Test123!@#"}')

if echo "$WORKING_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Working user: SUCCESS"
else
  echo "❌ Working user: FAILED"
  echo "$WORKING_RESULT" | jq '.error'
fi

echo ""

# Test Nicholls user (should now work)
echo "2. Testing Nicholls user (15nicholls444@gmail.com)..."
NICHOLLS_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"15nicholls444@gmail.com","password":"PasswordCosa4"}')

if echo "$NICHOLLS_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Nicholls user: SUCCESS"
else
  echo "❌ Nicholls user: FAILED"
  echo "$NICHOLLS_RESULT" | jq '.error'
fi

echo ""

# Test Neicko user (should now work)
echo "3. Testing Neicko user (Neickomarsh02@gmail.com)..."
NEICKO_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"Neickomarsh02@gmail.com","password":"PUMPUMaccess1"}')

if echo "$NEICKO_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Neicko user: SUCCESS"
else
  echo "❌ Neicko user: FAILED"
  echo "$NEICKO_RESULT" | jq '.error'
fi

echo ""

# Summary
echo "=== AUTHENTICATION TEST SUMMARY ==="
WORKING_OK=$(echo "$WORKING_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")
NICHOLLS_OK=$(echo "$NICHOLLS_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")
NEICKO_OK=$(echo "$NEICKO_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")

echo "Working user:  $WORKING_OK"
echo "Nicholls user: $NICHOLLS_OK"
echo "Neicko user:   $NEICKO_OK"

if [[ "$WORKING_OK" == "✅" && "$NICHOLLS_OK" == "✅" && "$NEICKO_OK" == "✅" ]]; then
  echo ""
  echo "🎉 ALL USERS CAN AUTHENTICATE SUCCESSFULLY!"
  echo "The 500 error issue has been resolved."
else
  echo ""
  echo "⚠️  Some users still have authentication issues."
  echo "Please check the error messages above and run the SQL fixes again."
fi
