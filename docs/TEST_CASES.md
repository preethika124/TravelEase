# Test cases

## Playwright journeys

1. Home → search flights → verify flight cards and price/airline filters update results.
2. Open flight details → passenger form → choose a seat → booking summary.
3. Checkout cannot create a booking until the explicit confirmation checkbox is selected; then it shows a unique booking reference.
4. Search hotels → adjust price/rating/amenities filters → open a hotel → choose a room.
5. Navigate to My trips and verify booking display.
6. Registration/login validation and profile save feedback.
7. Mobile navigation opens and routes to flights and stays.

## API cases

- Flight/hotel queries return validated JSON envelope and request ID.
- Invalid filters are rejected; missing records return 404.
- Booking preview does not write a booking.
- Booking creation without JWT, explicit confirmation, payment approval or idempotency key is rejected.
- Repeated create with the same key returns one booking only.
- Customer cannot read or cancel another user's booking.
- Agent endpoints reject absent/wrong `x-agent-key`; sensitive calls also reject absent user JWT.
- Simulated payment does not accept real card, PIN or OTP fields.
