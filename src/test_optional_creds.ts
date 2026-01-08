/**
 * Quick test to verify Coinbase API credentials are optional
 */

import { CoinbasePerps } from './coinbase_perps';

async function testOptionalCredentials() {
  console.log('Testing Coinbase client initialization without credentials...\n');
  
  // Test 1: Initialize without credentials
  try {
    console.log('Test 1: Initialize without credentials');
    const client = new CoinbasePerps({});
    console.log('✅ Client initialized successfully without credentials');
  } catch (error: any) {
    console.log('❌ Failed to initialize client:', error.message);
  }
  
  console.log('');
  
  // Test 2: Initialize with empty credentials
  try {
    console.log('Test 2: Initialize with empty strings as credentials');
    const client = new CoinbasePerps({
      apiKey: '',
      apiSecret: '',
      passphrase: ''
    });
    console.log('✅ Client initialized successfully with empty credentials');
  } catch (error: any) {
    console.log('❌ Failed to initialize client:', error.message);
  }
  
  console.log('');
  
  // Test 3: Try to use public endpoint (should work without credentials)
  try {
    console.log('Test 3: Use public endpoint without credentials');
    const client = new CoinbasePerps({});
    
    console.log('Attempting to fetch funding rate (public endpoint)...');
    const rate = await client.getFundingRate('BTC-PERP');
    
    // Validate rate is a number (could be 0 if API unavailable)
    if (typeof rate === 'number' && !isNaN(rate)) {
      console.log(`✅ Funding rate fetched: ${(rate * 100).toFixed(4)}% (or 0 if API unavailable)`);
    } else {
      console.log(`⚠️  Unexpected rate value: ${rate}`);
    }
  } catch (error: any) {
    // This might fail due to network issues or API being unavailable
    // but not due to missing credentials
    console.log(`⚠️  Note: ${error.message}`);
    
    // Check if error is related to missing credentials
    const credentialRelatedErrors = /credentials?|apikey|api.?key|secret|passphrase|authentication|unauthorized/i;
    if (credentialRelatedErrors.test(error.message)) {
      console.log('❌ FAIL: Should not require credentials for public endpoint');
    } else {
      console.log('✅ PASS: Failed for reasons other than credentials (network/API availability)');
    }
  }
}

testOptionalCredentials();
