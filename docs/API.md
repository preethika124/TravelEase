# TravelEase REST API

Base URL: `http://localhost:4000/api`. JSON responses have the shape `{ success, data, error, requestId }`; `X-Request-Id` is also returned as a response header. Request bodies are limited to 100 KB. Validation errors use HTTP 422, authentication errors 401, conflicts 409, and unexpected errors return a generic message with details only in server logs.

## Authentication and account

Register with `POST /auth/register` body `{"email":"you@example.com","name":"Your Name","password":"at-least-10-chars1"}` or sign in with `POST /auth/login` body `{"email":"you@example.com","password":"..."}`. The browser receives an HttpOnly session cookie; API clients may use the returned JWT as `Authorization: Bearer <token>`. Tokens are signed with HS256, issuer `travelease`, audience `travelease-customer`, and a 12 hour expiry. `POST /auth/logout` clears the cookie. `GET /me` and `PATCH /me` read/update the current user profile.

## Search

- `GET /flights/search?from=Hyderabad&to=Visakhapatnam&date=YYYY-MM-DD&passengers=2&sort=price`
- `GET /flights/:id` and `GET /flights/:id/seats`
- `GET /hotels/search?destination=Hyderabad&checkIn=ISO_DATE&checkOut=ISO_DATE&guests=2&rooms=1&maxPrice=15000&minRating=4`
- `GET /hotels/:id?checkIn=ISO_DATE&checkOut=ISO_DATE&guests=2&rooms=1`

Search availability is based on current seat assignments and overlapping hotel reservations. Hotel query dates are optional for discovery, but required to create a reservation. Hotel room `units` represents the number of equivalent rooms available for overlapping stays.

## Booking lifecycle

All booking routes require customer authentication. The customer first submits a preview; this reads current catalogue prices and inventory but creates no records:

```json
POST /bookings/preview
{"items":[{"type":"FLIGHT","referenceId":"flight-id","seatIds":["seat-id"],"passengers":[{"firstName":"Asha","lastName":"Rao","email":"asha@example.com","phone":"+919876543210"}]}]}
```

Hotel item form:

```json
{"type":"HOTEL","referenceId":"hotel-id","roomId":"room-id","checkIn":"2026-12-20T00:00:00.000Z","checkOut":"2026-12-22T00:00:00.000Z","guests":2,"passengers":[{"firstName":"Asha","lastName":"Rao","email":"asha@example.com","phone":"+919876543210"},{"firstName":"Dev","lastName":"Rao","email":"dev@example.com","phone":"+919876543211"}]}
```

For a booking containing multiple rooms, send one hotel item per room. The booking service verifies each room's capacity and total room units for the requested dates. Do not send client-calculated amounts: the API calculates prices from the database.

After reviewing the returned totals, explicitly confirm using:

```json
POST /bookings
Headers: Idempotency-Key: <unique-value-at-least-16-characters>
{"confirmed":true,"paymentToken":"DEMO_APPROVED","items":[...same items as preview...]}
```

The payment token is a fixed demo marker, not a card/payment credential. This application does not process real payments. Reusing a key with the same payload returns the existing booking; reusing it with another payload returns 409. Flight seats are conditionally claimed and dated hotel reservations are checked inside a serializable transaction. A conflict rolls back the entire booking.

- `GET /bookings` lists only the signed-in user's bookings.
- `GET /bookings/:id` retrieves a booking by database ID or booking code, owner-scoped.
- `POST /bookings/:id/cancel` cancels an owned booking, marks demo payment refunded and releases seats/room inventory.
- `GET /booking-draft`, `PUT /booking-draft`, `DELETE /booking-draft` manage one expiring two-hour draft per account.

## Independent agent integration

Configure `AGENT_API_KEY` on the TravelEase backend and store the same secret in the independent AgentPlatform backend's secret configuration. Send it as `x-agent-key`; never expose it to browser code. Public catalogue routes under `/agent` require that key. Private lookup, preview, create, and cancel require both the machine key and the affected customer's bearer JWT. Agent booking create calls the exact same preview/transaction service and requires the same explicit confirmation and `Idempotency-Key` as customer booking. The machine key does not act as user consent.

Available endpoints mirror customer search/details under `/agent`; transaction routes are `POST /agent/bookings/preview`, `POST /agent/bookings`, `GET /agent/bookings/:id`, and `POST /agent/bookings/:id/cancel`. See `../AgentPlatform` for the caller implementation and its configuration.
