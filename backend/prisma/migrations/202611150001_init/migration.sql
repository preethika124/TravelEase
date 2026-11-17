CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "BookingType" AS ENUM ('FLIGHT', 'HOTEL');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'REFUNDED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Airport" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "city" TEXT NOT NULL, "state" TEXT NOT NULL,
  CONSTRAINT "Airport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Airport_code_key" ON "Airport"("code");

CREATE TABLE "Airline" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Airline_code_key" ON "Airline"("code");

CREATE TABLE "Flight" (
  "id" TEXT NOT NULL, "airlineId" TEXT NOT NULL, "originId" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL, "departure" TIMESTAMP(3) NOT NULL,
  "arrival" TIMESTAMP(3) NOT NULL, "durationMins" INTEGER NOT NULL,
  "price" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'INR',
  "cabin" TEXT NOT NULL DEFAULT 'ECONOMY',
  CONSTRAINT "Flight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Flight_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Flight_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Flight_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Flight_originId_destinationId_departure_idx" ON "Flight"("originId", "destinationId", "departure");

CREATE TABLE "FlightSeat" (
  "id" TEXT NOT NULL, "flightId" TEXT NOT NULL, "seatNumber" TEXT NOT NULL,
  "cabinClass" TEXT NOT NULL DEFAULT 'ECONOMY', "price" INTEGER NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "FlightSeat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlightSeat_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FlightSeat_flightId_seatNumber_key" ON "FlightSeat"("flightId", "seatNumber");

CREATE TABLE "Hotel" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "city" TEXT NOT NULL,
  "address" TEXT NOT NULL, "rating" DOUBLE PRECISION NOT NULL, "description" TEXT NOT NULL,
  CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelRoom" (
  "id" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL, "pricePerNight" INTEGER NOT NULL,
  "amenities" TEXT[] NOT NULL, "available" BOOLEAN NOT NULL DEFAULT true,
  "cancellationPolicy" TEXT NOT NULL,
  CONSTRAINT "HotelRoom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HotelRoom_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Passenger" (
  "id" TEXT NOT NULL, "userId" TEXT, "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT NOT NULL,
  CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Passenger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL, "bookingCode" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING', "totalAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

CREATE TABLE "BookingItem" (
  "id" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "type" "BookingType" NOT NULL,
  "referenceId" TEXT NOT NULL, "description" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  "details" JSONB,
  CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "_BookingItemToPassenger" (
  "A" TEXT NOT NULL, "B" TEXT NOT NULL,
  CONSTRAINT "_BookingItemToPassenger_A_fkey" FOREIGN KEY ("A") REFERENCES "BookingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_BookingItemToPassenger_B_fkey" FOREIGN KEY ("B") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_BookingItemToPassenger_AB_unique" ON "_BookingItemToPassenger"("A", "B");
CREATE INDEX "_BookingItemToPassenger_B_index" ON "_BookingItemToPassenger"("B");

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
  "provider" TEXT NOT NULL DEFAULT 'DEMO', "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

CREATE TABLE "Review" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "hotelId" TEXT,
  "rating" INTEGER NOT NULL, "comment" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Review_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
