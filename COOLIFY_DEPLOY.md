# Quick Deployment Guide for Coolify

## Step-by-Step Instructions

### Step 1: Get Your Supabase Keys

1. Go to your Supabase dashboard
2. Navigate to: **Settings** -> **API**
3. Copy these values:
   - **URL**: `http://supabase.internal-network.com:8000` (or your internal URL)
   - **service_role key**: The long JWT starting with `eyJ...`

**Important**: Use the `service_role` key, NOT the `anon` key!

---

### Step 2: Deploy in Coolify
### 2️⃣ Deploy in Coolify

#### Add New Application

1. Open Coolify dashboard
2. Click **"+ New"** -> **"Application"**
3. Select **"Public Repository"** or connect your GitHub/GitLab account

#### Configure Application

**General Settings:**
- **Repository**: Your Git repository URL
- **Branch**: `main`
- **Build Pack**: Dockerfile (auto-detected)
- **Port**: `3000`

**Domain Settings:**
- **Domain**: `auth-proxy.internal-network.com` (or whatever your internal DNS uses)
- **HTTPS**: Optional for internal network

#### Add Environment Variables

Click on **"Environment Variables"** tab and add:

```bash
SUPABASE_URL=http://supabase.internal-network.com:8000
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
INTERNAL_API_URL=http://api.internal-network.com:8080
INTERNAL_API_KEY=your-optional-secret-key
PORT=3000
```

**Replace with your actual values:**
- `SUPABASE_URL`: Your internal Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: From step 1
- `INTERNAL_API_URL`: Your existing internal API URL
- `INTERNAL_API_KEY`: Optional - add if you want extra security
- `PORT`: Leave as 3000

#### Deploy

1. Click **"Deploy"** button
2. Wait for build to complete (watch logs)
3. Look for: `Supabase Auth Proxy started successfully!`

---

### Step 3: Verify Deployment

Test the health endpoint:

```bash
curl http://auth-proxy.internal-network.com:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-04T...",
  "supabase": "http://supabase.internal-network.com:8000",
  "internalApi": "http://api.internal-network.com:8080"
}
```

---

### Step 4: Update VPS Nginx

SSH into your VPS and edit Nginx config:

```bash
sudo nano /etc/nginx/sites-available/your-site
```

Add this location block:

```nginx
# Auth Proxy - NEW
location /api/ {
    proxy_pass http://auth-proxy.internal-network.com:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Authorization $http_authorization;
}
```

Test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 5: Test End-to-End

#### Test 1: Public endpoint without auth (should fail)
```bash
curl https://yourdomain.com/api/test
```
Expected: `401 Unauthorized`

#### Test 2: Login and get JWT

In your browser console or app:
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'password'
});

const { data: { session } } = await supabase.auth.getSession();
console.log('JWT:', session.access_token);
```

#### Test 3: Call API with JWT
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://yourdomain.com/api/test
```
Expected: Response from your internal API

---

## You're Done!

Your setup is complete! Now only authenticated Supabase users can access your internal API.

---

## Frontend Integration

Update your Alpine.js app:

```javascript
// API helper function
async function apiCall(endpoint, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not logged in');
  }
  
  const response = await fetch(`https://yourdomain.com/api/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Session expired, redirect to login
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Usage
const users = await apiCall('users');
const profile = await apiCall('profile', { method: 'POST', body: {...} });
```

---

## Troubleshooting

### Check Logs in Coolify
1. Go to your auth-proxy application
2. Click **"Logs"** tab
3. Look for error messages

### Common Issues

**Missing Authorization header**
- Check Nginx is forwarding the header (see step 5)
- Verify frontend is sending `Authorization: Bearer <token>`

**Invalid token**
- User needs to log in again (session expired)
- Check `SUPABASE_URL` is correct

**Service Unavailable**
- Check `INTERNAL_API_URL` is correct
- Verify internal API is running
- Test: `curl http://api.internal-network.com:8080`

**Build Failed**
- Check all files are in the repository
- Verify Dockerfile exists
- Check Coolify logs for specific error

---

## Alternative: Docker Image Deployment

If you prefer not to use Git:

### Build and Push Image

```bash
# Build
docker build -t YOUR_USERNAME/supabase-auth-proxy:latest .

# Login to Docker Hub
docker login

# Push
docker push YOUR_USERNAME/supabase-auth-proxy:latest
```

### Deploy in Coolify

1. Click **"+ New"** -> **"Application"**
2. Select **"Docker Image"**
3. Image: `YOUR_USERNAME/supabase-auth-proxy:latest`
4. Add environment variables (same as step 3C)
5. Deploy

---

## Need Help?

Check the main README.md for more detailed information and examples!
