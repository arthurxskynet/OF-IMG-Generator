#!/bin/bash

# Recreate Users via Admin API
# This script will recreate the failing users using the admin API

echo "=== Recreating Users via Admin API ==="
echo ""

# Step 1: Clean up existing users (run the SQL cleanup first)
echo "1. Make sure you've run the SQL cleanup script first!"
echo "   Run: fix-users-via-admin-api.sql in Supabase SQL Editor"
echo ""

# Step 2: Create Nicholls user via Admin API
echo "2. Creating Nicholls user (15nicholls444@gmail.com)..."
NICHOLLS_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/create-user-admin' \
  -H 'content-type: application/json' \
  --data '{"email":"15nicholls444@gmail.com","password":"PasswordCosa4","full_name":"Nicholls User"}')

if echo "$NICHOLLS_RESULT" | jq -e '.success == true' > /dev/null; then
  echo "✅ Nicholls user created successfully"
  echo "$NICHOLLS_RESULT" | jq '.user'
else
  echo "❌ Failed to create Nicholls user"
  echo "$NICHOLLS_RESULT" | jq '.error'
fi

echo ""

# Step 3: Create Neicko user via Admin API
echo "3. Creating Neicko user (Neickomarsh02@gmail.com)..."
NEICKO_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/create-user-admin' \
  -H 'content-type: application/json' \
  --data '{"email":"Neickomarsh02@gmail.com","password":"PUMPUMaccess1","full_name":"Neicko User"}')

if echo "$NEICKO_RESULT" | jq -e '.success == true' > /dev/null; then
  echo "✅ Neicko user created successfully"
  echo "$NEICKO_RESULT" | jq '.user'
else
  echo "❌ Failed to create Neicko user"
  echo "$NEICKO_RESULT" | jq '.error'
fi

echo ""

# Step 4: Test authentication
echo "4. Testing authentication..."
echo ""

# Test working user (should still work)
echo "Testing working user (passarthur2003@icloud.com)..."
WORKING_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"passarthur2003@icloud.com","password":"Test123!@#"}')

if echo "$WORKING_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Working user: SUCCESS"
else
  echo "❌ Working user: FAILED"
  echo "$WORKING_RESULT" | jq '.error'
fi

# Test Nicholls user
echo "Testing Nicholls user (15nicholls444@gmail.com)..."
NICHOLLS_AUTH_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"15nicholls444@gmail.com","password":"PasswordCosa4"}')

if echo "$NICHOLLS_AUTH_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Nicholls user: SUCCESS"
else
  echo "❌ Nicholls user: FAILED"
  echo "$NICHOLLS_AUTH_RESULT" | jq '.error'
fi

# Test Neicko user
echo "Testing Neicko user (Neickomarsh02@gmail.com)..."
NEICKO_AUTH_RESULT=$(curl -s -X POST 'http://localhost:3000/api/debug/signin-detailed' \
  -H 'content-type: application/json' \
  --data '{"email":"Neickomarsh02@gmail.com","password":"PUMPUMaccess1"}')

if echo "$NEICKO_AUTH_RESULT" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Neicko user: SUCCESS"
else
  echo "❌ Neicko user: FAILED"
  echo "$NEICKO_AUTH_RESULT" | jq '.error'
fi

echo ""

# Final summary
echo "=== FINAL SUMMARY ==="
WORKING_OK=$(echo "$WORKING_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")
NICHOLLS_OK=$(echo "$NICHOLLS_AUTH_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")
NEICKO_OK=$(echo "$NEICKO_AUTH_RESULT" | jq -e '.ok == true' > /dev/null && echo "✅" || echo "❌")

echo "Working user:  $WORKING_OK"
echo "Nicholls user: $NICHOLLS_OK"
echo "Neicko user:   $NEICKO_OK"

if [[ "$WORKING_OK" == "✅" && "$NICHOLLS_OK" == "✅" && "$NEICKO_OK" == "✅" ]]; then
  echo ""
  echo "🎉 ALL USERS CAN NOW AUTHENTICATE SUCCESSFULLY!"
  echo "The 500 error issue has been resolved using the Admin API approach."
else
  echo ""
  echo "⚠️  Some users still have authentication issues."
  echo "Please check the error messages above."
fi
