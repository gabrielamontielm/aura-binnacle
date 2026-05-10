# Security Specification for Art Curator AI

## Data Invariants
1. A User Profile can only be created or updated by the authenticated user matching the document ID.
2. An Art Item can only be saved/read/deleted by the owner of the parent user document.
3. Every Art Item must contain valid artwork details (title, artist, etc.).
4. Immutable fields like `uid` in UserProfile and `userId` in ArtItem must not change after creation.

## The Dirty Dozen Payloads

### 1. Identity Spoofing (UserProfile)
Attempt to create a profile for another user.
```json
// Path: /users/attacker-uid
{
  "uid": "victim-uid",
  "email": "victim@example.com"
}
```
**Expected: PERMISSION_DENIED**

### 2. Identity Spoofing (ArtItem)
Attempt to save an item to another user's collection.
```json
// Path: /users/victim-uid/items/item-123
{
  "id": "item-123",
  "userId": "victim-uid",
  "details": { ... }
}
```
**Expected: PERMISSION_DENIED**

### 3. PII Leak
Attempt to read another user's profile.
**Expected: PERMISSION_DENIED**

### 4. Malicious ID
Attempt to use an extremely long document ID to cause resource exhaustion.
**Expected: PERMISSION_DENIED**

### 5. Type Poisoning
Attempt to send a number instead of a string for the artwork title.
```json
{
  "details": { "title": 12345, ... }
}
```
**Expected: PERMISSION_DENIED**

### 6. Shadow Fields
Attempt to inject hidden fields not in the schema.
```json
{
  "isVerified": true,
  "details": { ... }
}
```
**Expected: PERMISSION_DENIED**

### 7. Missing Required Fields
Attempt to save an ArtItem without the 'image' field.
**Expected: PERMISSION_DENIED**

### 8. Immutable Field Violation
Attempt to change the `userId` of an existing ArtItem.
**Expected: PERMISSION_DENIED**

### 9. Resource Poisoning (Large Strings)
Attempt to send a 1MB string for the artwork title.
**Expected: PERMISSION_DENIED**

### 10. Unauthorized Deletion
Attempt to delete another user's saved artwork.
**Expected: PERMISSION_DENIED**

### 11. Global Read Attempt
Attempt to list all users.
**Expected: PERMISSION_DENIED**

### 12. Non-Verified Email (if required)
Attempt to write data without a verified email (app has no specific requirement but good practice).
**Expected: PERMISSION_DENIED** (if verification enforced)

## Test Runner
See `firestore.rules.test.ts` (conceptual).
