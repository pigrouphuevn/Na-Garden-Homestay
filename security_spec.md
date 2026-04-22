# Security Specification for Hotel Tracker

## Data Invariants
- A booking must have a valid `date` (YYYY-MM-DD) and a valid `roomId`.
- A booking's `guestName` must not be empty.
- A user can only read and write bookings if they are authenticated.
- Prices and deposits must be non-negative numbers.

## The "Dirty Dozen" Payloads (Testing Denials)
1. **Unauthenticated Write**: Attempting to create a booking without being logged in.
2. **Identity Spoofing**: Attempting to write a booking with an invalid date format.
3. **Ghost Field**: Adding a field like `isAdmin: true` to a booking object.
4. **Invalid Type**: Sending a string for the `price` field.
5. **Negative Value**: Sending a negative number for `deposit`.
6. **Room Poisoning**: Using a 1MB string as a `roomId`.
7. **Date Poisoning**: Using an invalid date string.
8. **Missing Required Field**: Creating a booking without `guestName`.
9. **Unauthorized Update**: Attempting to change an immutable field if any (though here we allow full updates).
10. **Shadow List**: Attempting to read all bookings without being signed in.
11. **ID Injection**: Attempting to create a document with an ID containing special characters (beyond standard alphanumeric).
12. **Mass Update**: Attempting to update multiple fields that aren't in the schema.

## The Test Runner
(Tests would be implemented in `firestore.rules.test.ts` using the Firebase Rules Emulator library)
