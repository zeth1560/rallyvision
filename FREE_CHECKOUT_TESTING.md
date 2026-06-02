# Free Checkout Flow - Testing Guide

## Overview
This document describes how to test the new free checkout flow that allows users to add multiple free clips to a cart and complete checkout with a single email entry.

---

## TEST SCENARIO 1: FREE CART CHECKOUT ✅

### Prerequisites
1. Create a test clip with `price_cents = 0` (or use a pricing rule that makes it free)
2. Set `published = true`
3. Ensure clip has valid `s3_key` pointing to a file in the originals/ folder
4. Create at least 2 free clips for cart testing

### Steps
1. Open `/session/{bookingId}` (the session page with clips)
2. Add at least one free clip to cart: Click "Add to Cart"
3. Verify cart shows:
   - Clip in cart list
   - Price displays as $0.00
   - Email input field appears
   - Button says "Complete Free Checkout"
4. Enter email: `test-free@example.com`
5. Click "Complete Free Checkout"
6. Watch browser console (F12):
   - Look for: `[SessionClipGrid] Checkout started`
   - Look for: `[SessionClipGrid] All-free cart detected`
   - Look for: `[SessionClipGrid] Calling free checkout endpoint`
7. Page should redirect to `/player-trove?email=test-free@example.com`
8. Verify page loads with claimed clips visible

### Verify in Database
```sql
SELECT * FROM player_video_access 
WHERE email = 'test-free@example.com' 
AND access_source = 'free_pilot'
ORDER BY created_at DESC
LIMIT 5;
```

Expected:
- Multiple rows (one per free clip claimed)
- `email`: test-free@example.com
- `access_source`: free_pilot
- `purchased_s3_key`: purchased/free-{access_id}/{filename}
- `purchased_copy_created_at`: recent timestamp
- All expiry dates set to now + 30 days

### Verify S3
- Files should exist at: `s3://bucket/purchased/free-{access_id}/{filename}.mp4`
- Use AWS CLI to verify: `aws s3 ls s3://bucket/purchased/free-*/`

---

## TEST SCENARIO 2: MIXED CART ERROR ❌

### Steps
1. Open `/session/{bookingId}` with both free and paid clips
2. Add one free clip: Click "Add to Cart"
3. Add one paid clip: Click "Add to Cart"  
4. Verify cart shows both clips with correct prices
5. Click "Complete Free Checkout" (if button still shows this)
   OR click "Checkout" (if button shows this)
6. Should see error: "Please check out free and paid clips separately"

### Browser Console Check
- Should show: `[SessionClipGrid] Mixed cart detected`
- Error message should be clear

### Workaround
1. Remove the paid clip from cart
2. Checkout free clip using scenario 1
3. Then go back and checkout paid clip separately using Stripe

---

## TEST SCENARIO 3: EMAIL VALIDATION ⚠️

### Test 3A: Missing Email
1. Add free clip to cart
2. Leave email field empty
3. Click "Complete Free Checkout"
4. Should see error: "Please enter your email address"
5. No API call should be made

### Test 3B: Email Normalization
1. Add free clip to cart
2. Enter email with mixed case and spaces: `  Test@EXAMPLE.COM  `
3. Click "Complete Free Checkout"
4. Check database - email should be normalized:
   - Spaces trimmed: `test@example.com`
   - Lowercase applied: `test@example.com`

---

## TEST SCENARIO 4: IDEMPOTENCY ✅

### Steps
1. Complete TEST SCENARIO 1 with email: `idempotent-test@example.com`
2. Verify clips were claimed and S3 copy created
3. Go back to session page
4. Add the SAME free clips to cart again
5. Enter same email: `idempotent-test@example.com`
6. Click "Complete Free Checkout"
7. Should succeed without errors

### Verify in Database
```sql
SELECT email, clip_id, access_source, count(*) 
FROM player_video_access 
WHERE email = 'idempotent-test@example.com'
GROUP BY email, clip_id, access_source;
```

Expected:
- Should have only ONE row per clip (not duplicated)
- Same access_id should be reused
- `purchased_s3_key` should be populated (from first checkout)
- Endpoint should return success even on retry

---

## TEST SCENARIO 5: EXPIRED CLIPS ⏰

### Setup
1. Create a test clip with `price_cents = 0` and `created_at` = 31 days ago
2. Ensure it's published

### Steps
1. Add the old clip to cart
2. Click "Complete Free Checkout"
3. Should see error: "One or more clips have expired and are no longer available"
4. Error should include clip id or slug

### Database Verification
The endpoint should check: `now > (clip.created_at + 30 days)`

---

## TEST SCENARIO 6: SINGLE-CLIP CLAIM STILL WORKS ✅

This is the legacy flow - make sure it still works alongside the cart flow.

### Steps
1. Go to `/clip/{slug}` for a free clip
2. Verify BuyButton shows email input + "Claim Free Access" button
3. Enter email: `single-clip@example.com`
4. Click "Claim Free Access"
5. Should redirect to `/player-trove?email=single-clip@example.com`
6. Clip should be available for download

### Note
- This is the existing `/api/player-trove/claim-free` endpoint
- Should continue working as before
- Useful for direct links to single clips

---

## TEST SCENARIO 7: PAID CART STILL WORKS ✅

Regression test - ensure we didn't break Stripe checkout.

### Steps
1. Add only PAID clips to cart
2. Click "Checkout"
3. Button should say "Checkout" (not "Complete Free Checkout")
4. Should NOT ask for email
5. Should redirect to Stripe checkout
6. Complete payment
7. Verify success page shows clips available for download

---

## TEST SCENARIO 8: LOGGING VERIFICATION 📋

Watch server logs (console.log) during TEST SCENARIO 1:

### Expected Log Sequence
```
[FREE_CHECKOUT] Request started
  email: test-free@example.com
  clip_ids_requested: [id1, id2]

[FREE_CHECKOUT] Clips resolved
  clip_count: 2
  resolved_prices: [{id: id1, price_cents: 0}, ...]

[FREE_CHECKOUT] Validation passed
  email: test-free@example.com
  clip_ids: [id1, id2]

[FREE_CHECKOUT] Created new access record
  clip_id: id1
  access_id: {uuid}

[FREE_CHECKOUT] S3 copy started
  clip_id: id1
  destination_key: purchased/free-{uuid}/filename.mp4

[FREE_CHECKOUT] S3 copy completed
  destination_key: purchased/free-{uuid}/filename.mp4

[FREE_CHECKOUT] Updated purchased_s3_key
  purchased_s3_key: purchased/free-{uuid}/filename.mp4

[FREE_CHECKOUT] Checkout complete, redirecting
  clip_ids: [id1, id2]
  access_records_created: 2
  redirect_destination: /player-trove?email=test-free@example.com
```

---

## TEST SCENARIO 9: SECURITY - BYPASS ATTEMPTS 🔒

### 9A: Direct API Call to /api/checkout/free with Paid Clips
```javascript
// In browser console
fetch('/api/checkout/free', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    clip_ids: ['{PAID_CLIP_ID}']
  })
})
.then(r => r.json())
.then(console.log)
```

Expected Response:
```json
{
  "error": "Free checkout can only process free clips",
  "paid_clip_ids": ["{PAID_CLIP_ID}"]
}
Status: 400
```

### 9B: Cart Checkout with Mixed Clips (via create-cart-checkout-session)
```javascript
fetch('/api/create-cart-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clipIds: ['{FREE_CLIP_ID}', '{PAID_CLIP_ID}'],
    bookingId: 'test'
  })
})
.then(r => r.json())
.then(console.log)
```

Expected Response:
```json
{
  "error": "Please check out free and paid clips separately",
  "errorCode": "MIXED_CART_NOT_SUPPORTED",
  "free_clip_ids": [...],
  "paid_clip_ids": [...]
}
Status: 400
```

---

## FILES CHANGED

### Created
- `/app/api/checkout/free/route.ts` - New free checkout endpoint

### Modified
- `/app/api/create-cart-checkout-session/route.ts` - Handle mixed/free carts
- `/app/components/SessionClipGrid.tsx` - Add email input, free checkout flow
- `/app/components/BuyButton.tsx` - Already handles single-clip free claims

---

## LOCAL TESTING CHECKLIST

- [ ] Can add multiple free clips to cart
- [ ] Email input appears only for free-only carts
- [ ] Can complete free checkout with email
- [ ] Redirect to PlayerTrove works
- [ ] `player_video_access` records created with correct data
- [ ] S3 files copied successfully  
- [ ] Idempotency works (same email + clips = no duplicates)
- [ ] Mixed cart shows error
- [ ] Paid-only cart still works
- [ ] Single-clip claim still works
- [ ] Expired clips rejected
- [ ] Logging shows expected messages
- [ ] Security bypass attempts blocked

---

## API REFERENCE

### POST /api/checkout/free

Request:
```json
{
  "email": "user@example.com",
  "clip_ids": ["clip-id-1", "clip-id-2"]
}
```

Success Response (200):
```json
{
  "success": true,
  "email": "user@example.com",
  "clip_ids": ["clip-id-1", "clip-id-2"],
  "access_records": [
    {
      "id": "{uuid}",
      "clip_id": "clip-id-1",
      "isNew": true
    }
  ],
  "redirect_url": "/player-trove?email=user@example.com"
}
```

Error Response Examples:
```json
// Missing email
{
  "error": "Email is required",
  "status": 400
}

// Paid clips in request
{
  "error": "Free checkout can only process free clips",
  "paid_clip_ids": ["clip-id-1"]
}

// Expired clips
{
  "error": "One or more clips have expired and are no longer available for free checkout",
  "expired_clip_ids": ["clip-id-1"],
  "expired_clip_info": [
    {
      "id": "clip-id-1",
      "slug": "clip-slug",
      "created_at": "2026-04-28T..."
    }
  ]
}
```

---

## Monitoring & Debugging

### View All Free Checkouts
```sql
SELECT * FROM player_video_access 
WHERE access_source = 'free_pilot'
ORDER BY purchased_at DESC
LIMIT 20;
```

### Find Clips Claimed by User
```sql
SELECT clip_id, access_status, purchased_at, download_expires_at
FROM player_video_access
WHERE email = 'user@example.com' AND access_source = 'free_pilot'
ORDER BY purchased_at DESC;
```

### Check S3 Purchased Files
```bash
# List all free purchased copies
aws s3 ls s3://bucket/purchased/free-/ --recursive

# Check specific access record's files
aws s3 ls s3://bucket/purchased/free-{ACCESS_ID}/
```
