# Supabase Auth Proxy

A lightweight authentication proxy that protects your internal APIs with Supabase JWT verification.

## What It Does

- Validates Supabase JWT tokens before forwarding requests
- Protects insecure internal APIs without modifying them
- Passes user context to your internal API
- Blocks unauthorized requests automatically

## Architecture

```
User Browser -> VPS Nginx -> Auth Proxy -> Internal API
                              |
                         Supabase Auth
                       (validates JWT)
```

## Prerequisites

- Coolify installed on your private network
- Self-hosted Supabase instance
- Internal API running (doesn't need auth)
- VPS with Nginx reverse proxy

## Deployment Options

### Option 1: Deploy to Coolify (Recommended)

#### Step 1: Make the Code Available to Coolify

Place the project in any Git repository or file source that Coolify can access. A simple Git repo works well, but feel free to use whichever workflow fits your setup.

#### Step 2: Deploy in Coolify

1. **Add New Resource:**
   - Go to Coolify dashboard
   - Click `+ New Resource`
   - Select `Application`

2. **Connect Repository:**
   - Choose `Public Repository` or connect your Git account
   - Enter your repository URL
   - Select the `main` branch

3. **Configure Build:**
   - Build Pack: `Dockerfile`
   - Coolify will auto-detect the Dockerfile

4. **Set Domain (Internal):**
   - Domain: `auth-proxy.internal-network.com` (or your internal DNS)
   - Port: `3000`
   - HTTPS: Not required for internal (optional)

5. **Add Environment Variables:**
   
   Go to `Environment Variables` tab and add:
   
   ```bash
   SUPABASE_URL=http://supabase.internal-network.com:8000
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   INTERNAL_API_URL=http://api.internal-network.com:8080
   INTERNAL_API_KEY=optional-shared-secret
   PORT=3000
   ```
   
   **Finding your Supabase Service Role Key:**
   - In your Supabase dashboard: Settings -> API
   - Copy the `service_role` key (NOT the anon key)

6. **Deploy:**
   - Click `Deploy`
   - Wait for build to complete
   - Check logs to verify it started successfully

#### Step 3: Verify Deployment

```bash
# Test health endpoint
curl http://auth-proxy.internal-network.com:3000/health

# Expected response:
# {"status":"ok","timestamp":"...","supabase":"...","internalApi":"..."}
```

### Option 2: Deploy with Docker Compose

If you prefer Docker Compose in Coolify:

1. **Add New Resource:**
   - Click `+ New Resource`
   - Select `Docker Compose`

2. **Use This Compose File:**
   ```yaml
   version: '3.8'
   
   services:
     auth-proxy:
       image: YOUR_USERNAME/supabase-auth-proxy:latest
       container_name: supabase-auth-proxy
       ports:
         - "3000:3000"
       environment:
         - SUPABASE_URL=http://supabase.internal-network.com:8000
         - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
         - INTERNAL_API_URL=http://api.internal-network.com:8080
         - INTERNAL_API_KEY=${INTERNAL_API_KEY}
         - PORT=3000
       restart: unless-stopped
   ```

3. **Set Environment Variables in Coolify**

4. **Deploy**

### Option 3: Build and Push Docker Image

If you want to use a pre-built image:

```bash
# Build the image
docker build -t YOUR_USERNAME/supabase-auth-proxy:latest .

# Push to Docker Hub
docker push YOUR_USERNAME/supabase-auth-proxy:latest

# Deploy in Coolify using "Docker Image" option
# Image: YOUR_USERNAME/supabase-auth-proxy:latest
```

## VPS Nginx Configuration

Add this to your Nginx config on the VPS:

```nginx
# Existing Supabase proxy
location /auth/ {
    proxy_pass http://supabase.internal-network.com:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# NEW: Auth Proxy
location /api/ {
    proxy_pass http://auth-proxy.internal-network.com:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;  # Critical!
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Frontend Integration (Alpine.js)

Update your Alpine.js app to use the auth proxy:

```javascript
// Initialize Supabase client
const supabase = createClient(
  'https://yourdomain.com/auth',  // Your public Supabase endpoint
  'your-anon-key'
);

// Login function
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    console.error('Login failed:', error);
    return;
  }
  
  console.log('Logged in:', data.user.email);
}

// API call function
async function callAPI(endpoint, options = {}) {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not logged in');
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
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

// Usage example
async function fetchUserProfile() {
  try {
    const profile = await callAPI('users/profile');
    console.log('Profile:', profile);
  } catch (error) {
    console.error('Failed to fetch profile:', error);
  }
}
```

## Testing

### 1. Test Health Endpoint (No Auth Required)

```bash
curl http://auth-proxy.internal-network.com:3000/health
```

### 2. Test Without Authentication (Should Fail)

```bash
curl http://auth-proxy.internal-network.com:3000/api/users
# Expected: 401 Unauthorized
```

### 3. Test With Valid JWT

```bash
# First, get a JWT from Supabase login
# Then use it:

curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://auth-proxy.internal-network.com:3000/api/users
# Expected: Response from your internal API
```

### 4. Test Through VPS (Public Endpoint)

```bash
# Without auth - should fail
curl https://yourdomain.com/api/users

# With auth - should work
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://yourdomain.com/api/users
```

## Monitoring and Logs

View logs in Coolify:
1. Go to your auth-proxy application
2. Click on `Logs` tab
3. Look for:
   - `Authenticated user:` - Successful auth
   - `Token validation failed:` - Failed auth attempts
   - `Proxying request to:` - API calls being forwarded

## Security Features

- JWT validation with Supabase
- Automatic token expiry checking
- User context passed to internal API
- Optional internal API key for defense-in-depth
- Non-root Docker user
- Health checks enabled
- CORS support

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | Yes | Your Supabase instance URL | `http://supabase.internal-network.com:8000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase | `eyJhbGc...` |
| `INTERNAL_API_URL` | Yes | Your internal API base URL | `http://api.internal-network.com:8080` |
| `INTERNAL_API_KEY` | No | Optional shared secret | `your-secret-key` |
| `PORT` | No | Server port (default: 3000) | `3000` |

## Request Flow

1. **Client sends request:**
   ```
   GET https://yourdomain.com/api/users
   Authorization: Bearer <jwt-token>
   ```

2. **VPS Nginx forwards to Auth Proxy**

3. **Auth Proxy validates JWT with Supabase:**
   - Checks token signature
   - Verifies not expired
   - Confirms user exists

4. **If valid, forwards to Internal API:**
   ```
   GET http://api.internal-network.com:8080/users
   X-User-Id: user-uuid
   X-User-Email: user@example.com
   X-Internal-Key: optional-secret
   ```

5. **Returns response to client**

## Troubleshooting

### "Missing Authorization header"
- Ensure your frontend is sending `Authorization: Bearer <token>`
- Check Nginx is forwarding the Authorization header

### "Invalid or expired token"
- User session may have expired - re-login required
- Check token is the `access_token` from session

### "Service Unavailable"
- Internal API is not reachable
- Check `INTERNAL_API_URL` is correct
- Verify internal API is running

### "Authentication failed"
- Check `SUPABASE_URL` is correct
- Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key
- Check Supabase is accessible from the proxy

## You're Done!

Your internal API is now protected! Only users who log in through Supabase can access it.

## Notes

- The internal API doesn't need any changes
- JWT validation happens in the proxy
- User info is passed via headers to your internal API
- Your "vibe coder's" insecure API stays insecure, but safe!
