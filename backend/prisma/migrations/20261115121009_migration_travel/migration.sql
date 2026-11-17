-- AlterTable
ALTER TABLE "_BookingItemToPassenger" ADD CONSTRAINT "_BookingItemToPassenger_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_BookingItemToPassenger_AB_unique";
