# Database

The PostgreSQL data model is defined in `backend/prisma/schema.prisma`; the initial migration is `backend/prisma/migrations/202611150001_init/migration.sql`. Run `npm run db:migrate -w backend` to apply it and `npm run db:seed -w backend` for demonstration data. The schema includes users, airports, airlines, flights, flight seats, hotels, rooms, passengers, bookings, booking items, payments and reviews.
