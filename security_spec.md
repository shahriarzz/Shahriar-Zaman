# Security Specification for GAINLOG

## 1. Data Invariants
- A user can only access and modify their own documents under `/users/{userId}`.
- All workout types must be from the allowed `WorkoutType` enum.
- Log dates and workout IDs must be valid strings.
- Timestamps and record IDs are strictly enforced per user.

## 2. The Dirty Dozen Payloads
1. **Identity Theft (Write)**: Attempt to write to `/users/anotherUser/workouts/wo1` as `authenticatedUser`.
2. **Ghost Field Injection**: Adding `isVerified: true` to a Workout document.
3. **Resource Poisoning**: Setting `exercise.note` to a 500KB string.
4. **Invalid State Transition**: Manually setting `complete: true` on a log with 0 sets.
5. **Path Poisoning**: Using `../` or long junk strings as `workoutId`.
6. **Type Spoofing**: Setting `Workout.type` to `ultra-elite-coach`.
7. **Date Corruption**: Setting `cycleStart` to `invalid-date-string`.
8. **Owner Mutation**: Trying to update a Workout but changing the `userId` in the payload (if it were stored there).
9. **Bulk Scrape**: Querying `/users` collection without a specific `userId` filter.
10. **Shadow Key Update**: Updating a log but including unauthorized keys like `systemAudit: "passed"`.
11. **Negative Duration**: Setting `duration: -100` in a session log.
12. **Missing Required Fields**: Creating a Workout without a `name`.

## 3. Test Runner (Draft)
```typescript
// firestore.rules.test.ts
// This file simulates the rejection of these payloads.
// Implementation follows standard Firebase security rules testing patterns.
```
