# MapIt Backend — API Reference

Node.js + Express backend for the MapIt prototype.
Connected to Supabase (PostgreSQL + Auth + Storage).

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (auto-restarts on file changes)
npm run dev

# Start production server
npm start
```

Server runs at: `http://localhost:3001`
Health check:   `http://localhost:3001/health`

---

## Environment Variables

Copy `.env.template` to `.env` and fill in your Supabase credentials.
See `.env.template` for all required variables.

---

## Authentication

All protected endpoints require a `Bearer` token in the header:

```
Authorization: Bearer <supabase_session_token>
```

The token is returned by `/api/auth/verify-otp` after successful OTP login.

---

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/validate-invite?code=XXX` | No | Check invite code validity |
| POST | `/api/auth/send-otp` | No | Send OTP to email |
| POST | `/api/auth/verify-otp` | No | Verify OTP, get session token |
| POST | `/api/auth/register` | Yes | Complete profile after signup |
| GET | `/api/auth/me` | Yes | Get current user + profile |
| POST | `/api/auth/logout` | Yes | Sign out |

### Listings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/listings?lat=&lng=&radius=&category=&q=` | Yes | Get nearby listings |
| GET | `/api/listings/:id` | Yes | Get single listing (full detail) |
| POST | `/api/listings` | Yes | Create listing (goes to review) |
| PUT | `/api/listings/:id` | Yes | Update own listing |
| DELETE | `/api/listings/:id` | Yes | Delete own listing |
| PUT | `/api/listings/:id/sold` | Yes | Mark listing as sold |
| GET | `/api/listings/mine/all?status=` | Yes | Get own listings |
| POST | `/api/listings/:id/save` | Yes | Save/unsave listing (toggle) |
| GET | `/api/listings/saved/all` | Yes | Get saved listings |
| POST | `/api/listings/:id/view` | Yes | Increment view count |

### Listings — Query Parameters
- `lat`, `lng` — user's location (decimal degrees)
- `radius` — in metres (1000=1km, 5000=5km, 999000=city-wide)
- `category` — `re` | `veh` | `furn` | `electronics`
- `subcategory` — e.g. `Buy`, `Rent`, `Cars`, `Sofas`
- `q` — search text (matches title, address, subcategory)
- `limit` — results per page (default 50)
- `offset` — pagination offset (default 0)

### User Pins (Multiple Locations)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/pins` | Yes | Get all saved pins |
| POST | `/api/pins` | Yes | Add new pin |
| PUT | `/api/pins/:id` | Yes | Update pin label/location |
| DELETE | `/api/pins/:id` | Yes | Delete pin |
| PUT | `/api/pins/:id/default` | Yes | Set as active/default pin |

### Messages (Chat)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/messages/inbox` | Yes | All conversations |
| GET | `/api/messages/:listing_id/:other_user_id` | Yes | Get chat thread |
| POST | `/api/messages` | Yes | Send a message |
| PUT | `/api/messages/:id/read` | Yes | Mark as read |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/:id` | Yes | Get public profile |
| PUT | `/api/users/me/profile` | Yes | Update own profile |
| GET | `/api/users/:id/listings` | Yes | Get user's public listings |
| POST | `/api/users/feedback/submit` | Yes | Submit feedback |

### Photo Uploads
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/uploads/listing/:id` | Yes | Upload photos (multipart/form-data, field: `photos[]`) |
| DELETE | `/api/uploads/photo/:id` | Yes | Delete a photo |
| PUT | `/api/uploads/photo/:id/order` | Yes | Set photo sort order |

---

## Project Structure

```
mapit-backend/
├── src/
│   ├── config/
│   │   └── supabase.js       Supabase client setup
│   ├── middleware/
│   │   ├── auth.js           JWT verification
│   │   └── errorHandler.js   Global error handling
│   ├── routes/
│   │   ├── auth.js           Login, OTP, registration
│   │   ├── listings.js       CRUD + radius search
│   │   ├── pins.js           User location pins
│   │   ├── messages.js       Chat
│   │   ├── users.js          Profiles + feedback
│   │   └── uploads.js        Photo upload to Supabase Storage
│   └── server.js             Express app entry point
├── .env.template             Environment variables template
├── .gitignore
├── package.json
├── vercel.json               Vercel deployment config
└── README.md
```

---

## Deploying to Vercel

1. Push this folder to a GitHub repository
2. Go to vercel.com → New Project → Import the repository
3. Add all `.env` variables in Vercel → Settings → Environment Variables
4. Deploy — Vercel auto-deploys on every push to `main`

---

## Testing the API

Use the health check first:
```
GET http://localhost:3001/health
```

Example: get listings near Koramangala within 5km:
```
GET http://localhost:3001/api/listings?lat=12.9352&lng=77.6245&radius=5000
Authorization: Bearer <your_token>
```
