const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Configuration
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_API_URL) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  if (!INTERNAL_API_URL) console.error('   - INTERNAL_API_URL');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('🔧 Configuration:');
console.log(`   Supabase URL: ${SUPABASE_URL}`);
console.log(`   Internal API: ${INTERNAL_API_URL}`);
console.log(`   Internal API Key: ${INTERNAL_API_KEY ? '✓ Set' : '✗ Not set'}`);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: SUPABASE_URL,
    internalApi: INTERNAL_API_URL
  });
});

// Auth middleware
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Missing or invalid Authorization header');
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.log('❌ Token validation failed:', error.message);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    
    if (!user) {
      console.log('❌ No user found for token');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    console.log(`✅ Authenticated user: ${user.email} (${user.id})`);
    
    // Attach user to request for use in routes
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: 'Internal authentication error'
    });
  }
}

// Proxy all requests to internal API
app.all('/api/*', verifyAuth, async (req, res) => {
  // Extract path after /api/
  const apiPath = req.url.replace(/^\/api\/?/, '');
  const internalUrl = `${INTERNAL_API_URL}/${apiPath}`;
  
  console.log(`🔄 Proxying ${req.method} request to: ${internalUrl}`);
  console.log(`   User: ${req.user.email}`);
  
  try {
    const response = await axios({
      method: req.method,
      url: internalUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        // Pass internal API key if configured
        ...(INTERNAL_API_KEY && { 'X-Internal-Key': INTERNAL_API_KEY }),
        // Pass user context to internal API
        'X-User-Id': req.user.id,
        'X-User-Email': req.user.email,
        // Forward original headers (except authorization)
        ...Object.fromEntries(
          Object.entries(req.headers)
            .filter(([key]) => !['authorization', 'host', 'content-length'].includes(key.toLowerCase()))
        )
      },
      validateStatus: () => true,  // Don't throw on any status code
      maxRedirects: 0  // Don't follow redirects
    });
    
    console.log(`✅ Response: ${response.status}`);
    
    // Forward response headers
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Service Unavailable',
        message: 'Internal API is not reachable'
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        error: 'Gateway Timeout',
        message: 'Internal API request timed out'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred while proxying the request'
    });
  }
});

// Catch-all for invalid routes
app.all('*', (req, res) => {
  if (req.path !== '/') {
    res.status(404).json({ 
      error: 'Not Found',
      message: 'Invalid endpoint. API routes should start with /api/'
    });
  } else {
    res.json({
      name: 'Supabase Auth Proxy',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        api: '/api/*'
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Supabase Auth Proxy started successfully!');
  console.log(`   Port: ${PORT}`);
  console.log(`   Health Check: http://localhost:${PORT}/health`);
  console.log(`   API Endpoint: http://localhost:${PORT}/api/*`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});
