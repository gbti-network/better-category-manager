/**
 * Simple script to check OpenAI API key status
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

// Load environment variables
dotenv.config();

// Load config
function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error('Error loading config:', error.message);
        return {};
    }
}

async function checkApiKey() {
    const config = loadConfig();
    const apiKey = process.env.OPENAI_API_KEY || config.openai_api_key;
    
    if (!apiKey) {
        console.error('❌ No OpenAI API key found in .env or config.json');
        return;
    }
    
    console.log('✓ API key found. Testing connection...');
    
    try {
        const openai = new OpenAI({ apiKey });
        
        // Make a minimal API call to test the key
        const models = await openai.models.list();
        console.log('✅ API key is valid! Connection successful.');
        console.log(`Available models: ${models.data.slice(0, 3).map(m => m.id).join(', ')}...`);
    } catch (error) {
        console.error('❌ Error testing API key:', error.message);
        if (error.message.includes('429')) {
            console.log('\n🔄 You are experiencing rate limits. Options:');
            console.log('1. Wait a few minutes before trying again');
            console.log('2. Check your OpenAI account for quota limits');
            console.log('3. Use a different API key');
        }
    }
}

checkApiKey();
