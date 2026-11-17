import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const airports = [['HYD','Rajiv Gandhi International Airport','Hyderabad','Telangana'],['VTZ','Visakhapatnam Airport','Visakhapatnam','Andhra Pradesh'],['BLR','Kempegowda International Airport','Bengaluru','Karnataka'],['DEL','Indira Gandhi International Airport','Delhi','Delhi'],['BOM','Chhatrapati Shivaji Maharaj International Airport','Mumbai','Maharashtra'],['MAA','Chennai International Airport','Chennai','Tamil Nadu']] as const;
  for (const [code,name,city,state] of airports) await db.airport.upsert({where:{code},update:{},create:{code,name,city,state}});
  for (const [code,name] of [['6E','IndiGo'],['AI','Air India'],['QP','Akasa Air'],['UK','Vistara']] as const) await db.airline.upsert({where:{code},update:{},create:{code,name}});
  const hyd=await db.airport.findUniqueOrThrow({where:{code:'HYD'}}),vtz=await db.airport.findUniqueOrThrow({where:{code:'VTZ'}}),blr=await db.airport.findUniqueOrThrow({where:{code:'BLR'}}),airline=await db.airline.findUniqueOrThrow({where:{code:'6E'}});
  // Keep demo inventory searchable across common future dates and both travel
  // directions. A single relative +33-day fixture silently expired for users
  // selecting other dates, despite the route being represented in the seed.
  const routes=[[hyd,vtz],[vtz,hyd],[blr,vtz],[vtz,blr]] as const;
  const today=new Date();today.setHours(0,0,0,0);
  for(let day=1;day<=60;day++) for(const [routeIndex,route] of routes.entries()) {
    const departure=new Date(today);departure.setDate(departure.getDate()+day);departure.setHours(8+routeIndex*2,15,0,0);
    const dateKey=departure.toISOString().slice(0,10).replaceAll('-','');
    const id=`seed-flight-${route[0].code}-${route[1].code}-${dateKey}`;
    const price=5299+routeIndex*600;
    await db.flight.upsert({where:{id},update:{airlineId:airline.id,originId:route[0].id,destinationId:route[1].id,departure,arrival:new Date(departure.getTime()+8100000),durationMins:135,price},create:{id,airlineId:airline.id,originId:route[0].id,destinationId:route[1].id,departure,arrival:new Date(departure.getTime()+8100000),durationMins:135,price,seats:{create:['12A','12B','12C','12D','12E','12F'].map((seat,j)=>({seatNumber:seat,cabinClass:'ECONOMY',price:j===0?0:500,available:true}))}}});
  }
  const hotels=[['seed-hotel-leela','The Leela Hyderabad','Hyderabad','Banjara Hills',4.9],['seed-hotel-taj-deccan','Taj Deccan','Hyderabad','Banjara Hills',4.8],['seed-hotel-itc','ITC Kohenur','Hyderabad','Madhapur',4.7],['seed-hotel-trident','Trident Hyderabad','Hyderabad','HITEC City',4.6],['seed-hotel-bengaluru','Taj Bengaluru','Bengaluru','MG Road',4.8],['seed-hotel-mumbai','Taj Mumbai','Mumbai','Colaba',4.7]] as const;
  for(const [id,name,city,address,rating] of hotels) await db.hotel.upsert({where:{id},update:{},create:{id,name,city,address,rating,description:`A thoughtfully selected ${name} stay in ${city}.`,rooms:{create:[{name:'Deluxe King Room',capacity:2,units:5,pricePerNight:9800,amenities:['Wi-Fi','Breakfast','Air conditioning'],cancellationPolicy:'Free cancellation until 48 hours before check-in.'},{name:'Premium Twin Room',capacity:3,units:4,pricePerNight:12400,amenities:['Wi-Fi','Pool','Breakfast'],cancellationPolicy:'Free cancellation until 48 hours before check-in.'}]}}});
  console.log('TravelEase seed complete (safe to run more than once).');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());
