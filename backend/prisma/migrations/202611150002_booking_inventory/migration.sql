ALTER TABLE "FlightSeat" ADD COLUMN "bookingItemId" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "homeAirport" TEXT;
ALTER TABLE "Booking" ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HotelRoom" ADD COLUMN "units" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "FlightSeat_bookingItemId_idx" ON "FlightSeat"("bookingItemId");
ALTER TABLE "FlightSeat" ADD CONSTRAINT "FlightSeat_bookingItemId_fkey"
  FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HotelRoomReservation" (
  "id" TEXT NOT NULL,
  "hotelRoomId" TEXT NOT NULL,
  "bookingItemId" TEXT NOT NULL,
  "checkIn" TIMESTAMP(3) NOT NULL,
  "checkOut" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelRoomReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HotelRoomReservation_dates_check" CHECK ("checkOut" > "checkIn"),
  CONSTRAINT "HotelRoomReservation_hotelRoomId_fkey" FOREIGN KEY ("hotelRoomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HotelRoomReservation_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HotelRoomReservation_bookingItemId_key" ON "HotelRoomReservation"("bookingItemId");
CREATE INDEX "HotelRoomReservation_hotelRoomId_checkIn_checkOut_status_idx" ON "HotelRoomReservation"("hotelRoomId","checkIn","checkOut","status");

CREATE TABLE "BookingDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingDraft_userId_key" ON "BookingDraft"("userId");
CREATE INDEX "BookingDraft_expiresAt_idx" ON "BookingDraft"("expiresAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_capacity_check" CHECK ("capacity" > 0);
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_units_check" CHECK ("units" > 0);
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_times_check" CHECK ("arrival" > "departure");
