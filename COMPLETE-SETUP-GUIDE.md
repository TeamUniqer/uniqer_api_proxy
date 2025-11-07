# Supabase Auth Proxy - Complete Setup Guide

## Get the Code

Clone or copy the project files into a repository that Coolify (or you) can access. At minimum you need everything in this folder:
```
index.js
package.json
Dockerfile
README.md
COOLIFY_DEPLOY.md
COMPLETE-SETUP-GUIDE.md
```
Feel free to add your own helper files (for example a `docker-compose.yml` or `.env` template) if you want them, but they are not required for deployment.

## What's Included

All files needed for deployment:
- `index.js` - Main server code
- `package.json` - Dependencies
- `Dockerfile` - Container configuration
- `README.md` - High-level overview
- `COOLIFY_DEPLOY.md` - Coolify deployment checklist
- `COMPLETE-SETUP-GUIDE.md` - This document

---

# Quick Start Guide

## Step 1: Get Your Supabase Keys

1. Open your Supabase dashboard
2. Go to: **Settings** -> **API**
3. Copy these values:
   - **URL**: Your Supabase URL (e.g., `http://supabase.internal-network.com:8000`)
   - **service_role key**: The JWT key (starts with `eyJ...`)

Important: Use the **service_role** key, NOT the anon key!

---

## Step 2: Deploy in Coolify

### A. Create New Application

1. Login to Coolify
2. Click **"+ New"** -> **"Application"**
3. Select **"Public Repository"** or connect GitHub
4. Enter your repository URL
5. Branch: `main`

### B. Configure Application

**Build Settings:**
- Build Pack: `Dockerfile` (auto-detected)
- Port: `3000`

**Domain:**
- Set to: `auth-proxy.internal-network.com` (or your internal DNS)
- HTTPS: Optional for internal network

### C. Add Environment Variables

Click **"Environment Variables"** and add these:

```
SUPABASE_URL=http://supabase.internal-network.com:8000
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
INTERNAL_API_URL=http://api.internal-network.com:8080
INTERNAL_API_KEY=your-optional-secret
PORT=3000
```

**Replace with your actual values:**
- `SUPABASE_URL` - Your internal Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - From Step 1
- `INTERNAL_API_URL` - Your existing API URL
- `INTERNAL_API_KEY` - Optional extra security
- `PORT` - Keep as 3000

### D. Deploy

1. Click **"Deploy"**
2. Watch the logs
3. Look for: `Supabase Auth Proxy started successfully!`

---

## Step 3: Test Deployment

```bash
# Test health endpoint
curl http://auth-proxy.internal-network.com:3000/health

# Expected response:
# {"status":"ok","timestamp":"...","supabase":"...","internalApi":"..."}
```

---

## Step 4: Update VPS Nginx

SSH into your VPS:

```bash
ssh user@your-vps
sudo nano /etc/nginx/sites-available/your-site
```

Add this location block:

```nginx
# Auth Proxy for API
location /api/ {
    proxy_pass http://auth-proxy.internal-network.com:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;  # CRITICAL!
}
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 5: Update Your Frontend

In your Alpine.js app:

```javascript
// Initialize Supabase client (unchanged)
const supabase = createClient(
  'https://yourdomain.com/auth',
  'your-anon-key'
);

// Helper function for authenticated API calls
async function apiCall(endpoint, options = {}) {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    // Redirect to login or show error
    window.location.href = '/login';
    return;
  }
  
  // Make API call with JWT
  const response = await fetch(`https://yourdomain.com/api/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, redirect to login
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Usage examples
async function loadUserData() {
  try {
    const profile = await apiCall('users/profile');
    console.log('Profile:', profile);
    
    const settings = await apiCall('users/settings');
    console.log('Settings:', settings);
  } catch (error) {
    console.error('Failed to load user data:', error);
  }
}

async function updateProfile(data) {
  try {
    const result = await apiCall('users/profile', {
      method: 'PUT',
      body: data
    });
    console.log('Profile updated:', result);
  } catch (error) {
    console.error('Failed to update profile:', error);
  }
}
```

---

## Step 6: Test Everything

### Test 1: Without Authentication (Should Fail)

```bash
curl https://yourdomain.com/api/users
# Expected: 401 Unauthorized
```

### Test 2: With Authentication (Should Work)

Open your browser console on your app:

```javascript
// Login first
await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'password'
});

// Get token
const { data: { session } } = await supabase.auth.getSession();
console.log('Token:', session.access_token);

// Test API call
const response = await fetch('https://yourdomain.com/api/users', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
console.log('Response:', await response.json());
```

## You're Done!

Your internal API is now protected! Here's what you achieved:

Only logged-in Supabase users can access your API  
Automatic JWT validation on every request  
Your internal API didn't need any changes  
Unauthorized requests are blocked automatically  
User context is passed to your API  

---

## Architecture Overview

```
User Browser (Alpine.js)
    | Login via Supabase -> Get JWT
    | API call with Authorization: Bearer <jwt>
    |
VPS Nginx
    | Forwards to Auth Proxy
    |
Auth Proxy (NEW!)
    | Validates JWT with Supabase
    | If valid -> forwards to Internal API
    | If invalid -> returns 401
    |
Internal API (Unchanged!)
    | Processes request
    | Returns response
```

---

## Security Features

- JWT validation with Supabase Auth
- Automatic token expiry checking
- User context passed via headers
- Optional internal API key for defense-in-depth
- Non-root Docker container
- Health checks enabled
- Comprehensive logging

---

## Monitoring

View logs in Coolify:
1. Go to your auth-proxy application
2. Click **"Logs"** tab
3. Watch for:
   - `Authenticated user:` - Successful requests
   - `Token validation failed:` - Failed auth attempts
   - `Proxying request to:` - API calls

---

## Troubleshooting

### "Missing Authorization header"
**Solution:** 
- Check frontend is sending `Authorization: Bearer <token>`
- Verify Nginx forwards Authorization header (Step 5)

### "Invalid or expired token"
**Solution:**
- User session expired - they need to login again
- Verify you're using `session.access_token` not `session.refresh_token`

### "Service Unavailable"
**Solution:**
- Check `INTERNAL_API_URL` is correct
- Verify internal API is running
- Test: `curl http://api.internal-network.com:8080`

### "Authentication failed"
**Solution:**
- Verify `SUPABASE_URL` is correct
- Check `SUPABASE_SERVICE_ROLE_KEY` is the service role key
- Ensure Auth Proxy can reach Supabase

### Build failed in Coolify
**Solution:**
- Check all files are in repository
- Verify Dockerfile exists
- Review Coolify build logs for specific error

---

## Advanced Configuration

### Add Role-Based Access Control

Edit `index.js` and modify the `verifyAuth` function:

```javascript
async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // ADD: Check user role from metadata
  const userRole = user.user_metadata?.role || 'user';
  
  // ADD: Protect admin routes
  if (req.path.startsWith('/api/admin') && userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.user = user;
  req.userRole = userRole;
  next();
}
```

### Add Rate Limiting

Install express-rate-limit:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### Add Request Logging

```javascript
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});
```

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | Yes | Your Supabase instance URL | `http://supabase.internal-network.com:8000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase | `eyJhbGc...` |
| `INTERNAL_API_URL` | Yes | Your internal API base URL | `http://api.internal-network.com:8080` |
| `INTERNAL_API_KEY` | No | Optional shared secret for extra security | `your-secret-key` |
| `PORT` | No | Server port (default: 3000) | `3000` |

---

## Getting Help

If you run into issues:

1. Check the logs in Coolify
2. Test the health endpoint: `curl http://auth-proxy.internal-network.com:3000/health`
3. Verify environment variables are set correctly
4. Test Supabase connection directly
5. Check Nginx configuration and reload

---

## Success Checklist

- [ ] Auth Proxy deployed in Coolify
- [ ] Environment variables configured
- [ ] Health endpoint returns 200 OK
- [ ] Nginx updated with `/api/` route
- [ ] Frontend updated to include JWT tokens
- [ ] Test without auth returns 401 (expected failure)
- [ ] Test with auth returns data
- [ ] Your internal API is now secure!

---

**Made to protect your "vibe coder's" insecure API**
