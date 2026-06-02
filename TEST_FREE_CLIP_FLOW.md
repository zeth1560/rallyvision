# FREE CLIP DOWNLOAD FLOW - TEST INSTRUCTIONS

## ISSUE FIXED
Free clips were bypassing email capture and downloading anonymously without creating `player_video_access` records. Now all free clips MUST be claimed with email first.

---

## QUICK SUMMARY OF CHANGES

### What Changed:
1. **Free checkout endpoint blocked** - Returns error instead of creating fake orders
2. **Download routes secured** - Reject any `free_*` session IDs
3. **BuyButton enhanced** - Validates `isFree` prop and logs operations
4. **PlayerTrove download implemented** - New endpoint validates email + clip_id
5. **PlayerTrove button wired** - Download button now works with proper email validation

### What Users Will See:
- **Free clips**: Email input + "Claim Free Access" button (no payment)
- **After claiming**: Redirected to PlayerTrove where they can download
- **Paid clips**: "Buy Download" button (unchanged behavior)

---

## PREREQUISITE: DATABASE MIGRATION

Before testing, apply the migration:

```sql
-- Add downloaded_at tracking field to player_video_access
ALTER TABLE player_video_access ADD COLUMN downloaded_at timestamptz;

-- Create index for querying download history
CREATE INDEX idx_player_video_access_downloaded_at 
  ON player_video_access(downloaded_at);
```

Or if using Supabase CLI:
```bash
supabase db push  # Runs migrations/004_add_downloaded_at_field.sql
```

---

## TEST SCENARIO 1: FREE CLIP CLAIM FLOW ✅

**Setup:**
1. Create a test clip with `price_cents = 0` or set pricing rule to 0
2. Publish the clip
3. Ensure clip has `s3_key` pointing to valid HD file in originals/ folder

**Steps:**
1. Open `/clip/{slug}` in browser
2. Developer console: Open DevTools (F12)
3. Verify BuyButton shows:
   - Email input field
   - "Claim Free Access" button (not "Buy Download")
4. Enter test email: `test-free-user@example.com`
5. Click "Claim Free Access"
6. Watch console logs:
   - Look for: `[BuyButton] handleFreeClick triggered` with email + timestamp
   - Look for: `[BuyButton] Free claim succeeded`
7. Page should redirect to `/player-trove?email=test-free-user@example.com`
8. Should see the claimed clip in grid

**Verify in Database:**
```sql
SELECT * FROM player_video_access 
WHERE email = 'test-free-user@example.com' 
AND access_source = 'free_pilot'
LIMIT 1;
```

Expected columns:
- `email`: test-free-user@example.com
- `access_source`: free_pilot
- `purchased_s3_key`: purchased/free-{uuid}/{filename}.mp4
- `purchased_copy_created_at`: timestamp
- `download_expires_at`: now + 30 days
- `access_status`: active

**Verify S3:**
- File should exist at: `s3://bucket/purchased/free-{uuid}/{filename}.mp4`

---

## TEST SCENARIO 2: FREE CLIP DOWNLOAD FROM PLAYERTROKE ✅

**Prerequisite:** 
- Completed Test Scenario 1 with claimed clip

**Steps:**
1. On PlayerTrove page, click "Download HD File" button for claimed clip
2. Developer console logs:
   - Look for: `[PlayerTrove] Download started` with email + clip_id
3. Download should start automatically
4. File should download as: `{clip-title}.mp4`

**Verify in Database:**
```sql
SELECT email, clip_id, downloaded_at, download_expires_at
FROM player_video_access 
WHERE email = 'test-free-user@example.com'
ORDER BY downloaded_at DESC
LIMIT 1;
```

Expected:
- `downloaded_at`: Should be populated with recent timestamp

**Verify Expiry:**
1. On PlayerTrove, download button should be enabled
2. Manually set `download_expires_at` to past date in DB:
   ```sql
   UPDATE player_video_access 
   SET download_expires_at = NOW() - INTERVAL '1 day'
   WHERE email = 'test-free-user@example.com';
   ```
3. Refresh page
4. Button should show "Download Expired" and be disabled

---

## TEST SCENARIO 3: SECURITY - BYPASS ATTEMPT BLOCKED ❌

### 3A: Try Direct Checkout with Free Clip
```javascript
// In browser console:
fetch('/api/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clipId: '{free-clip-id}' })
})
.then(r => r.json())
.then(console.log)
```

**Expected Result:**
```json
{
  "error": "Free clips cannot be purchased through checkout. Use the \"Claim Free Access\" option with your email instead.",
  "errorCode": "FREE_CLIP_BYPASS_ATTEMPT"
}
```

**Server Log Should Show:**
```
[SECURITY] Attempt to checkout free clip via paid flow
```

### 3B: Try Direct Download with Free Session ID
```bash
curl "http://localhost:3000/api/download?clip_id={uuid}&session_id=free_123456"
```

**Expected Result:**
```json
{
  "error": "Free clips cannot be downloaded directly. Please claim access and download from your PlayerTrove."
}
```

**Server Log Should Show:**
```
[SECURITY] Attempt to download free clip via paid orders flow
```

### 3C: Try Free Cart Checkout
```javascript
// In browser console:
fetch('/api/create-cart-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    clipIds: ['{free-clip-id-1}', '{free-clip-id-2}'],
    bookingId: 'test-booking'
  })
})
.then(r => r.json())
.then(console.log)
```

**Expected Result:**
```json
{
  "error": "Carts containing only free clips cannot be purchased through checkout. Claim each free clip individually using the \"Claim Free Access\" option with your email instead.",
  "errorCode": "FREE_CLIPS_CART_BYPASS_ATTEMPT"
}
```

**Server Log Should Show:**
```
[SECURITY] Attempt to checkout free cart (all free clips) via paid flow
```

---

## TEST SCENARIO 4: PAID CLIP FLOW (REGRESSION TEST) ✅

**Setup:**
1. Create a paid test clip with `price_cents = 500`
2. Publish the clip

**Steps:**
1. Open `/clip/{slug}` in browser
2. Verify BuyButton shows:
   - "Buy Download" button (NOT email input)
3. Click "Buy Download"
4. Developer console logs:
   - Look for: `[BuyButton] handlePaidClick triggered`
5. Should redirect to Stripe checkout
6. Complete test payment in Stripe
7. After payment, should redirect to `/success?session_id={actual-session-id}`
8. Success page should show download button

**Verify:**
- Webhook should create orders record
- player_video_access should be created with `access_source = 'stripe'`
- Download button on success page should work
- User can download from success page OR from PlayerTrove with their email

---

## TEST SCENARIO 5: PLAYERTROKE SECURITY - EMAIL REQUIRED ✅

**Steps:**
1. Try accessing `/player-trove` without email param:
   - Should show error: "Email parameter required"
2. Try accessing `/player-trove?email=hacker@example.com`:
   - If development mode: Queries but shows "No purchased videos found"
   - If production mode: Returns 403 "This endpoint is not available in production"
3. Try downloading with wrong email:
   ```bash
   curl "http://localhost:3000/api/player-trove/download?email=wrong@example.com&clip_id={uuid}"
   ```
   - Should return 403: "You do not have access to this clip"

---

## LOGGING VERIFICATION

### Search Server Logs for Test Results:

**Test 1 - Free claim:**
```
grep "\[BuyButton\] handleFreeClick triggered" logs
grep "\[BuyButton\] Free claim succeeded" logs
grep "Free claim requested" logs  # From /api/player-trove/claim-free
```

**Test 2 - Free download:**
```
grep "\[PlayerTrove\] Download started" logs
grep "\[PlayerTrove Download\] Download requested" logs
grep "\[PlayerTrove Download\] Signed URL generated" logs
```

**Test 3 - Security blocks:**
```
grep "\[SECURITY\]" logs | grep "Attempt to checkout free"
grep "\[SECURITY\]" logs | grep "Attempt to download free"
```

**Test 4 - Paid flow:**
```
grep "Webhook verified" logs
grep "Purchase copy started" logs
grep "purchase_window_expires_at" logs
```

---

## FILES MODIFIED

**Backend Routes:**
- ✅ `/app/api/create-checkout-session/route.ts` - Block free clips, return error
- ✅ `/app/api/create-cart-checkout-session/route.ts` - Block free carts, return error
- ✅ `/app/api/download/route.ts` - Reject free_ sessions
- ✅ `/app/api/download/[clipId]/route.ts` - Reject free_ sessions
- ✅ `/app/api/download-all/route.ts` - Reject free_ sessions
- ✅ `/app/api/player-trove/download/route.ts` - NEW - PlayerTrove download

**Frontend Components:**
- ✅ `/app/components/BuyButton.tsx` - Enhanced logging + validation
- ✅ `/app/player-trove/PlayerTroveContent.tsx` - Wire download button

**Database:**
- ✅ `/supabase/migrations/004_add_downloaded_at_field.sql` - NEW - Add tracking

---

## EXPECTED BEHAVIOR SUMMARY

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Free clip on /clip/{slug} | Show "Buy Download" button | Show email input + "Claim Free Access" |
| Click "Buy Download" for free clip | Creates fake order, redirects to success page | Returns error, stays on page |
| Download from /success for free clip | Works without email, no player_video_access | Blocked - must use PlayerTrove |
| Claim free clip with email | N/A (not possible before) | Creates player_video_access, redirects to PlayerTrove |
| Download from PlayerTrove | N/A (button not wired) | Works with email validation, uses purchased_s3_key |
| Paid clip flow | Works normally | Works normally (unchanged) |

---

## ROLLBACK PLAN

If issues found:

1. Revert checkout routes to accept free clips:
   - Remove the `if (resolvedPriceCents === 0) { return error }` blocks
   - Restore the synthetic session ID creation code

2. Disable PlayerTrove download blocking:
   - Comment out the `if (sessionId.startsWith('free_'))` checks in download routes

3. Remove PlayerTrove download button handler:
   - Comment out `handleDownloadClick()` in PlayerTroveContent

4. Keep BuyButton validation for safety (low risk)

---

## NOTES FOR PRODUCTION DEPLOYMENT

⚠️ **Before going live:**
1. ✅ Apply migration 004
2. ✅ Test all 5 scenarios above in staging
3. ✅ Check server logs for any `[SECURITY]` events (should be 0 unless testing bypasses)
4. ✅ Verify no existing free orders are stranded (query orders with `stripe_checkout_session_id LIKE 'free_%'`)
5. ⚠️ Disable `/api/player-trove` endpoint behind proper authentication instead of NODE_ENV check

**Future work:**
- Add proper JWT/auth to `/api/player-trove` instead of email query param
- Implement email verification for free claims (optional)
- Add rate limiting to `/api/player-trove/claim-free` to prevent abuse
- Monitor download success rate by access_source (free_pilot vs stripe)
