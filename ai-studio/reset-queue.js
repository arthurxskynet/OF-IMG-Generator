/* eslint-disable @typescript-eslint/no-require-imports */
// Simple script to reset stuck queue
const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function resetQueue() {
  try {
    console.log('Resetting stuck queue...');
    const response = await fetch(`${BASE_URL}/api/admin/reset-stuck-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Reset completed successfully!');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('❌ Reset failed:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetQueue();
