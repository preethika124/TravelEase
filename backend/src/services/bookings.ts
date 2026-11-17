import { createHash, randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const passengerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
});
const flightItemSchema = z.object({
  type: z.literal('FLIGHT'), referenceId: z.string().min(1), seatIds: z.array(z.string().min(1)).min(1).max(9),
  passengers: z.array(passengerSchema).min(1).max(9),
});
const hotelItemSchema = z.object({
  type: z.literal('HOTEL'), referenceId: z.string().min(1), roomId: z.string().min(1),
  checkIn: z.string().datetime(), checkOut: z.string().datetime(), guests: z.number().int().min(1).max(12),
  passengers: z.array(passengerSchema).min(1).max(12),
});
export const bookingItemsSchema = z.array(z.discriminatedUnion('type',[flightItemSchema,hotelItemSchema])).min(1).max(12);
export type BookingItems = z.infer<typeof bookingItemsSchema>;

type Db = PrismaClient | Prisma.TransactionClient;
function dayCount(start: Date, end: Date) { return Math.ceil((end.getTime()-start.getTime())/86_400_000); }

async function inspectItems(db: Db, items: BookingItems) {
  const previewItems: any[] = [];
  const quoted: any[] = [];
  const requestedRooms:Array<{roomId:string;checkIn:Date;checkOut:Date}> = [];
  for (const [index,item] of items.entries()) {
    if (item.type === 'FLIGHT') {
      if (item.seatIds.length !== item.passengers.length) throw new HttpError(422,'Choose one available seat for every passenger.');
      if (new Set(item.seatIds).size !== item.seatIds.length) throw new HttpError(422,'A seat cannot be selected more than once.');
      const flight=await db.flight.findUnique({where:{id:item.referenceId},include:{airline:true,origin:true,destination:true}});
      if(!flight)throw new HttpError(404,'The selected flight could not be found.');
      if(flight.departure<=new Date())throw new HttpError(409,'The selected flight has already departed.');
      const seats=await db.flightSeat.findMany({where:{id:{in:item.seatIds},flightId:flight.id,available:true,bookingItemId:null}});
      if(seats.length!==item.seatIds.length)throw new HttpError(409,'One or more selected seats are no longer available. Refresh seat availability and choose again.');
      const ordered=item.seatIds.map(id=>seats.find(s=>s.id===id)!);
      const amount=(flight.price*item.passengers.length)+ordered.reduce((sum,seat)=>sum+seat.price,0);
      const details={flightId:flight.id,flightNumber:`${flight.airline.code} ${flight.id.slice(-5).toUpperCase()}`,airline:flight.airline.name,
        origin:{code:flight.origin.code,city:flight.origin.city},destination:{code:flight.destination.code,city:flight.destination.city},
        departure:flight.departure,arrival:flight.arrival,durationMins:flight.durationMins,cabin:flight.cabin,
        seats:ordered.map(s=>({id:s.id,number:s.seatNumber,cabinClass:s.cabinClass,price:s.price})),passengerCount:item.passengers.length};
      previewItems.push({index,type:'FLIGHT',referenceId:flight.id,description:`${flight.airline.name}: ${flight.origin.city} to ${flight.destination.city}`,passengers:item.passengers,
        seats:details.seats,baseFare:flight.price,amount,currency:flight.currency,details});
      quoted.push({...item,details,amount});
    } else {
      const checkIn=new Date(item.checkIn),checkOut=new Date(item.checkOut),nights=dayCount(checkIn,checkOut);
      if(!Number.isFinite(checkIn.getTime())||!Number.isFinite(checkOut.getTime())||checkOut<=checkIn)throw new HttpError(422,'Check-out must be after check-in.');
      if(checkIn<new Date(new Date().setHours(0,0,0,0)))throw new HttpError(422,'Check-in cannot be in the past.');
      if(nights>30)throw new HttpError(422,'A stay cannot exceed 30 nights.');
      if(item.passengers.length!==item.guests)throw new HttpError(422,'Enter passenger details for each guest.');
      const hotel=await db.hotel.findUnique({where:{id:item.referenceId},include:{rooms:{where:{id:item.roomId,available:true}}}});
      if(!hotel)throw new HttpError(404,'The selected hotel could not be found.');
      const room=hotel.rooms[0];if(!room)throw new HttpError(409,'The selected room is no longer available.');
      if(item.guests>room.capacity)throw new HttpError(422,`This room can host up to ${room.capacity} guest(s).`);
      const occupied=await db.hotelRoomReservation.findMany({where:{hotelRoomId:room.id,status:'CONFIRMED',checkIn:{lt:checkOut},checkOut:{gt:checkIn}},select:{id:true}});
      const pending=requestedRooms.filter(r=>r.roomId===room.id&&r.checkIn<checkOut&&r.checkOut>checkIn).length;
      if(occupied.length+pending>=room.units)throw new HttpError(409,'There are not enough rooms of this type for those dates. Choose fewer rooms or different dates.');
      requestedRooms.push({roomId:room.id,checkIn,checkOut});
      const amount=room.pricePerNight*nights;
      const details={hotelId:hotel.id,hotelName:hotel.name,city:hotel.city,address:hotel.address,roomId:room.id,roomName:room.name,
        checkIn:checkIn.toISOString(),checkOut:checkOut.toISOString(),nights,guests:item.guests,capacity:room.capacity,amenities:room.amenities,cancellationPolicy:room.cancellationPolicy,pricePerNight:room.pricePerNight};
      previewItems.push({index,type:'HOTEL',referenceId:hotel.id,description:`${hotel.name} — ${room.name}`,passengers:item.passengers,details,amount,currency:'INR'});
      quoted.push({...item,details,amount});
    }
  }
  return {previewItems,quoted,total:previewItems.reduce((sum,item)=>sum+item.amount,0),currency:'INR'};
}

export async function previewBooking(db:Db, items:BookingItems) {
  const inspected=await inspectItems(db,items);
  return {...inspected,requiresExplicitConfirmation:true,paymentMode:'SIMULATED'};
}

function canonical(value:any):any {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}

export async function createBooking(db:PrismaClient,userId:string,items:BookingItems,idempotencyKey:string) {
  const requestHash=createHash('sha256').update(JSON.stringify(canonical(items))).digest('hex');
  const existing=await db.booking.findUnique({where:{idempotencyKey},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});
  if(existing){if(existing.requestHash!==requestHash)throw new HttpError(409,'This Idempotency-Key was already used for a different booking request.');if(existing.userId!==userId)throw new HttpError(409,'This Idempotency-Key belongs to another customer.');return existing;}
  try {
    return await db.$transaction(async tx=>{
      // Lock room rows before checking overlap; this serializes concurrent reservations for the same room.
      for(const item of items)if(item.type==='HOTEL')await tx.$queryRaw`SELECT "id" FROM "HotelRoom" WHERE "id"=${item.roomId} FOR UPDATE`;
      const checked=await inspectItems(tx,items);
      const booking=await tx.booking.create({data:{userId,bookingCode:`TE-${randomUUID().replaceAll('-','').slice(0,8).toUpperCase()}`,
        status:BookingStatus.CONFIRMED,totalAmount:checked.total,idempotencyKey,requestHash,confirmedAt:new Date(),
        items:{create:checked.quoted.map((item:any)=>({type:item.type,referenceId:item.referenceId,description:item.type==='FLIGHT'?item.details.airline+' '+item.details.flightNumber:item.description||item.details.hotelName+' — '+item.details.roomName,amount:item.amount,
          details:item.details as Prisma.InputJsonValue,passengers:{create:item.passengers.map((p:any)=>({...p,userId}))}}))},
        payment:{create:{status:'SUCCEEDED',provider:'DEMO',amount:checked.total}},
      },include:{items:{include:{passengers:true}},payment:true}});
      for(let i=0;i<items.length;i++){
        const input=items[i],created=booking.items[i];
        if(input.type==='FLIGHT'){
          const updated=await tx.flightSeat.updateMany({where:{id:{in:input.seatIds},flightId:input.referenceId,available:true,bookingItemId:null},data:{available:false,bookingItemId:created.id}});
          if(updated.count!==input.seatIds.length)throw new HttpError(409,'A selected flight seat was just booked. Your booking was rolled back; choose again.');
        } else {
          await tx.hotelRoomReservation.create({data:{hotelRoomId:input.roomId,bookingItemId:created.id,checkIn:new Date(input.checkIn),checkOut:new Date(input.checkOut)}});
        }
      }
      return tx.booking.findUniqueOrThrow({where:{id:booking.id},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:20000});
  } catch(error:any) {
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'){
      const duplicate=await db.booking.findUnique({where:{idempotencyKey},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});
      if(duplicate){if(duplicate.requestHash!==requestHash)throw new HttpError(409,'This Idempotency-Key was already used for a different booking request.');if(duplicate.userId!==userId)throw new HttpError(409,'This Idempotency-Key belongs to another customer.');return duplicate;}
    }
    if(error instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2003'].includes(error.code))throw new HttpError(409,'Availability changed while booking. Refresh your search and try again.');
    throw error;
  }
}

export async function cancelBooking(db:PrismaClient,userId:string,reference:string) {
  return db.$transaction(async tx=>{
    const booking=await tx.booking.findFirst({where:{userId,OR:[{id:reference},{bookingCode:reference}]},include:{items:{include:{flightSeats:true,hotelReservation:true}},payment:true}});
    if(!booking)throw new HttpError(404,'Booking not found.');
    if(booking.status==='CANCELLED')return booking;
    for(const item of booking.items){
      if(item.type==='FLIGHT')await tx.flightSeat.updateMany({where:{bookingItemId:item.id},data:{available:true,bookingItemId:null}});
      if(item.hotelReservation)await tx.hotelRoomReservation.update({where:{id:item.hotelReservation.id},data:{status:'CANCELLED'}});
    }
    if(booking.payment)await tx.payment.update({where:{bookingId:booking.id},data:{status:'REFUNDED'}});
    return tx.booking.update({where:{id:booking.id},data:{status:'CANCELLED'},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
