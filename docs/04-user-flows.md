# 04 — User Flows

---

## Flow 1 — First-Time Signup → Action Plan

1. User lands on `/` (placeholder page)
2. User navigates to `/signup`
3. User enters email + password → confirmation email sent
4. User clicks confirmation link → redirected to `/onboarding`
5. User enters name, location → profile created
6. User adds family members (name, age, medical flags, mobility flags)
7. User sets resource inventory (fuel, water, food, battery, cash)
8. User navigates to `/scenario`
9. User types emergency description → clicks Generate
10. Rules Engine evaluates urgency (CRITICAL/HIGH/MEDIUM/LOW)
11. If internet: Claude API + RAG → streaming response
12. If no internet: SURVIVAL mode → rules-based response
13. Action plan displayed with priority badge and knowledge sources
14. Action plan saved to `action_plans` table

---

## Flow 2 — Returning User

1. User opens app (PWA or browser)
2. Session cookie valid → lands on `/scenario` or last page
3. Describes emergency → gets action plan (same as Flow 1 steps 9–14)

---

## Flow 3 — Checklist Generation

1. User navigates to `/checklist`
2. Checklist loads from Supabase (or IndexedDB if offline)
3. User checks/unchecks items
4. Changes persist in real time

---

## Flow 4 — Circles

**Create:**
1. User navigates to `/circles`
2. Clicks "Create Circle" → enters name
3. Circle created with unique invite code
4. User shares invite code with family/community

**Join:**
1. User navigates to `/circles`
2. Clicks "Join Circle" → enters invite code
3. User added to circle as member

---

## Flow 5 — Password Recovery

1. User clicks "Forgot password" on `/login`
2. Enters email → receives recovery email
3. Clicks link → redirected to password reset form
4. Sets new password → redirected to `/scenario`

---

## Flow 6 — Offline SURVIVAL Mode

1. User opens PWA with no internet
2. Cached profile + inventory loaded from IndexedDB
3. User types scenario → Submit
4. `navigator.onLine === false` detected
5. Rules Engine runs locally → SURVIVAL mode response
6. No API calls made — fully offline

---

## Flow 7 — Language Selection

1. User opens `/settings`
2. User selects Português or English
3. Preference is saved on the device
4. Interface copy and document language update immediately
5. The same preference is restored on the next visit
