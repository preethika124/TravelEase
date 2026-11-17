import 'dotenv/config';
import express,{NextFunction,Request,Response} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {Prisma,PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {bookingItemsSchema,cancelBooking,createBooking,HttpError,passengerSchema,previewBooking} from './services/bookings.js';
import {registerAgentOAuth} from './agentOAuth.js';

const db=new PrismaClient();
const app=express();
const port=Number(process.env.PORT||4000);
const isProduction=process.env.NODE_ENV==='production';
const simulatedCheckoutEnabled=!isProduction||(process.env.PAYMENT_MODE==='demo'&&process.env.ALLOW_SIMULATED_CHECKOUT_IN_PRODUCTION==='true');
const frontendOrigin=process.env.FRONTEND_URL||'http://localhost:5173';
const corsOrigins=new Set([frontendOrigin,process.env.PUBLIC_API_URL,`http://localhost:${port}`,`http://127.0.0.1:${port}`].filter(Boolean).flatMap(value=>{try{return [new URL(value!).origin]}catch{return []}}));

declare global { namespace Express { interface Request { requestId:string; userId?:string } } }
const send=(res:Response,req:Request,data:unknown,status=200)=>res.status(status).json({success:true,data,error:null,requestId:req.requestId});
const fail=(res:Response,req:Request,status:number,message:string,code?:string)=>res.status(status).json({success:false,data:null,error:{message,...(code?{code}:{})},requestId:req.requestId});

app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-Id',req.requestId);const start=Date.now();res.on('finish',()=>console.log(JSON.stringify({level:'info',requestId:req.requestId,method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-start})));next()});
app.use(helmet());
app.use(cors({origin(origin,callback){return callback(null,!origin||corsOrigins.has(origin));},credentials:true}));
app.use(express.json({limit:'100kb'}));
app.use(express.urlencoded({extended:false,limit:'10kb'}));
app.use(rateLimit({windowMs:60_000,max:isProduction?100:180,standardHeaders:true,legacyHeaders:false,handler:(req,res)=>fail(res,req as Request,429,'Too many requests. Please wait and try again.')}));
const authLimiter=rateLimit({windowMs:15*60_000,max:isProduction?8:30,standardHeaders:true,legacyHeaders:false,handler:(req,res)=>fail(res,req as Request,429,'Too many authentication attempts. Please wait before retrying.')});

function authenticate(req:Request,res:Response,next:NextFunction){
  const header=req.header('authorization');const bearer=header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const cookie=req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith('travelease_session='))?.slice('travelease_session='.length);
  const token=bearer||cookie;
  if(!token){if(req.method==='GET'&&req.path==='/api/oauth/authorize'){const authorizeUrl=new URL(req.originalUrl,process.env.PUBLIC_API_URL||`http://localhost:${port}`);return res.redirect(302,`${frontendOrigin}/login?next=${encodeURIComponent(authorizeUrl.toString())}`);}return fail(res,req,401,'Authentication required.');}
  const secret=process.env.JWT_SECRET;if(!secret)return fail(res,req,503,'Authentication is not configured.');
  try{const claim=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'travelease',audience:'travelease-customer'}) as jwt.JwtPayload;if(typeof claim.sub!=='string')return fail(res,req,401,'Invalid authentication token.');if(claim.agent_client==='agentplatform'){const path=req.path;const needed=req.method==='GET'&&path.includes('/bookings/')?'bookings:read':path.includes('/bookings/')?'bookings:write':undefined;const granted=typeof claim.scope==='string'?claim.scope.split(' '):[];if(needed&&!granted.includes(needed))return fail(res,req,403,`Delegated TravelEase session lacks ${needed} permission.`);}req.userId=claim.sub;next();}
  catch{return fail(res,req,401,'Your session is invalid or expired. Please sign in again.');}
}
function authenticateAgent(req:Request,res:Response,next:NextFunction){
  const expected=process.env.AGENT_API_KEY,provided=req.header('x-agent-key');
  if(!expected)return fail(res,req,503,'Agent integration is not configured.');
  if(!provided)return fail(res,req,401,'Valid x-agent-key required.');
  const left=Buffer.from(expected),right=Buffer.from(provided);
  if(left.length!==right.length||!timingSafeEqual(left,right))return fail(res,req,401,'Valid x-agent-key required.');
  next();
}
registerAgentOAuth({app,db,appId:'travelease',issuer:'travelease',audience:'travelease-customer',jwtSecret:process.env.JWT_SECRET||'',authenticate,ok:(req,res,data,status)=>send(res,req,data,status),fail:(res,req,status,message,code)=>fail(res,req,status,message,code)});
const route=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)};
const routeParam=(req:Request,key:string):string=>{const value=req.params[key];return Array.isArray(value)?value[0]||'':value||'';};
const userSelect={id:true,email:true,name:true,phone:true,homeAirport:true,createdAt:true} as const;

app.get('/api/health',route(async(req,res)=>{await db.$queryRaw`SELECT 1`;return send(res,req,{status:'ok',service:'TravelEase API',database:'connected'});}));
app.get('/api-docs',(req,res)=>{const candidates=[new URL('../../docs/API.md',import.meta.url),new URL('../../../docs/API.md',import.meta.url)];const doc=candidates.find(path=>existsSync(path));if(!doc)return fail(res,req,404,'API reference file is unavailable.');return res.type('text/markdown').send(readFileSync(doc,'utf8'));});

const registerSchema=z.object({email:z.string().trim().email().max(254),name:z.string().trim().min(2).max(100),password:z.string().min(10).max(128).regex(/[A-Za-z]/,'Password must contain a letter.').regex(/[0-9]/,'Password must contain a number.')});
const loginSchema=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)});
function issueToken(userId:string){return jwt.sign({sub:userId},process.env.JWT_SECRET!,{algorithm:'HS256',expiresIn:'12h',issuer:'travelease',audience:'travelease-customer'});}
function attachSession(res:Response,token:string){res.cookie('travelease_session',token,{httpOnly:true,secure:isProduction,sameSite:'strict',maxAge:12*60*60*1000,path:'/'});}
app.post('/api/auth/register',authLimiter,route(async(req,res)=>{
  const input=registerSchema.parse(req.body);const email=input.email.toLowerCase();
  if(await db.user.findUnique({where:{email}}))throw new HttpError(409,'An account with this email already exists.');
  const user=await db.user.create({data:{email,name:input.name,passwordHash:await bcrypt.hash(input.password,12)},select:userSelect});
  const token=issueToken(user.id);attachSession(res,token);return send(res,req,{token,user},201);
}));
app.post('/api/auth/login',authLimiter,route(async(req,res)=>{
  const input=loginSchema.parse(req.body);const user=await db.user.findUnique({where:{email:input.email.toLowerCase()}});
  if(!user||!await bcrypt.compare(input.password,user.passwordHash))return fail(res,req,401,'Email or password is incorrect.');
  const token=issueToken(user.id);attachSession(res,token);return send(res,req,{token,user:{id:user.id,email:user.email,name:user.name,phone:user.phone,homeAirport:user.homeAirport,createdAt:user.createdAt}});
}));
app.post('/api/auth/logout',authenticate,(_req,res)=>{res.clearCookie('travelease_session',{httpOnly:true,secure:isProduction,sameSite:'strict',path:'/'});res.status(204).end();});
app.get('/api/me',authenticate,route(async(req,res)=>{const user=await db.user.findUnique({where:{id:req.userId},select:userSelect});if(!user)return fail(res,req,404,'Account not found.');return send(res,req,user);}));
app.patch('/api/me',authenticate,route(async(req,res)=>{
  const input=z.object({name:z.string().trim().min(2).max(100).optional(),phone:z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).nullable().optional(),homeAirport:z.string().trim().min(3).max(100).nullable().optional()}).strict().refine(x=>Object.keys(x).length>0,'Provide at least one profile field.').parse(req.body);
  const user=await db.user.update({where:{id:req.userId},data:input,select:userSelect});return send(res,req,user);
}));

const optionalSearchText=z.preprocess(value=>typeof value==='string'&&!value.trim()?undefined:value,z.string().trim().min(2).max(100).optional());
const flightQuery=z.object({from:optionalSearchText,to:optionalSearchText,date:z.coerce.date().optional(),maxPrice:z.coerce.number().int().positive().optional(),passengers:z.coerce.number().int().min(1).max(9).default(1),airline:optionalSearchText,sort:z.enum(['price','departure']).default('price')});
async function searchFlights(query:Record<string,unknown>){
  const q=flightQuery.parse(query);const rows=await db.flight.findMany({where:{...(q.from?{origin:{city:{contains:q.from,mode:'insensitive'}}}:{}),...(q.to?{destination:{city:{contains:q.to,mode:'insensitive'}}}:{}),...(q.airline?{airline:{name:{contains:q.airline,mode:'insensitive'}}}:{}),...(q.maxPrice?{price:{lte:q.maxPrice}}:{}),...(q.date?{departure:{gte:new Date(new Date(q.date).setHours(0,0,0,0)),lt:new Date(new Date(q.date).setHours(24,0,0,0))}}:{}),seats:{some:{available:true,bookingItemId:null}}},include:{airline:true,origin:true,destination:true,seats:{where:{available:true,bookingItemId:null},orderBy:{seatNumber:'asc'}}},orderBy:q.sort==='departure'?{departure:'asc'}:{price:'asc'}});
  return rows.filter(f=>f.seats.length>=q.passengers).map(f=>({...f,availableSeats:f.seats.length,seats:undefined}));
}
const hotelQuery=z.object({destination:optionalSearchText,checkIn:z.string().datetime().optional(),checkOut:z.string().datetime().optional(),guests:z.coerce.number().int().min(1).max(12).default(1),rooms:z.coerce.number().int().min(1).max(5).default(1),maxPrice:z.coerce.number().int().positive().optional(),minRating:z.coerce.number().min(0).max(5).optional()}).refine(q=>!q.checkIn||!q.checkOut||new Date(q.checkOut)>new Date(q.checkIn),'Check-out must be after check-in.').refine(q=>q.rooms<=q.guests,'Room count cannot exceed guest count.');
function hotelAvailabilityWhere(q:z.infer<typeof hotelQuery>){
  return {available:true,capacity:{gte:Math.ceil(q.guests/q.rooms)},units:{gte:q.rooms},...(q.maxPrice?{pricePerNight:{lte:q.maxPrice}}:{})};
}
function reservationWindow(q:z.infer<typeof hotelQuery>){const start=q.checkIn?new Date(q.checkIn):undefined,end=q.checkOut?new Date(q.checkOut):undefined;return start&&end?{where:{status:'CONFIRMED',checkIn:{lt:end},checkOut:{gt:start}}}:{where:{status:'CONFIRMED'}};}
async function searchHotels(query:Record<string,unknown>){
  const q=hotelQuery.parse(query);const reservations=reservationWindow(q);
  const rows=await db.hotel.findMany({where:{...(q.destination?{city:{contains:q.destination,mode:'insensitive'}}:{}),...(q.minRating?{rating:{gte:q.minRating}}:{}),rooms:{some:hotelAvailabilityWhere(q)}},include:{rooms:{where:hotelAvailabilityWhere(q),include:{reservations},orderBy:{pricePerNight:'asc'}}},orderBy:{rating:'desc'}});
  return rows.map(h=>({...h,rooms:h.rooms.filter(r=>r.units-(r.reservations?.length||0)>=q.rooms).sort((a,b)=>a.pricePerNight-b.pricePerNight),availableRooms:h.rooms.filter(r=>r.units-(r.reservations?.length||0)>=q.rooms).length})).filter(h=>h.availableRooms>0);
}
app.get('/api/flights/search',route(async(req,res)=>send(res,req,await searchFlights(req.query as Record<string,unknown>))));
app.get('/api/airports',route(async(req,res)=>send(res,req,await db.airport.findMany({orderBy:[{city:'asc'},{code:'asc'}]}))));
app.get('/api/flights/:id',route(async(req,res)=>{const f=await db.flight.findUnique({where:{id:routeParam(req,'id')},include:{airline:true,origin:true,destination:true,seats:{where:{available:true,bookingItemId:null},orderBy:{seatNumber:'asc'}}}});if(!f)return fail(res,req,404,'Flight not found.');return send(res,req,f);}));
app.get('/api/flights/:id/seats',route(async(req,res)=>{const f=await db.flight.findUnique({where:{id:routeParam(req,'id')},select:{id:true}});if(!f)return fail(res,req,404,'Flight not found.');const seats=await db.flightSeat.findMany({where:{flightId:f.id,available:true,bookingItemId:null},orderBy:{seatNumber:'asc'}});return send(res,req,seats);}));
app.get('/api/hotels/search',route(async(req,res)=>send(res,req,await searchHotels(req.query as Record<string,unknown>))));
app.get('/api/hotels/cities',route(async(req,res)=>send(res,req,await db.hotel.findMany({distinct:['city'],select:{city:true},orderBy:{city:'asc'}}))));
app.get('/api/hotels/:id',route(async(req,res)=>{const q=hotelQuery.parse(req.query);const hotel=await db.hotel.findUnique({where:{id:routeParam(req,'id')},include:{rooms:{where:hotelAvailabilityWhere(q),include:{reservations:reservationWindow(q)},orderBy:{pricePerNight:'asc'}}}});if(!hotel)return fail(res,req,404,'Hotel not found.');const rooms=hotel.rooms.filter(r=>r.units-(r.reservations?.length||0)>=q.rooms);return send(res,req,{...hotel,rooms,availableRooms:rooms.length});}));

const bookingRequestSchema=z.object({items:bookingItemsSchema,confirmed:z.literal(true).optional(),paymentToken:z.literal('DEMO_APPROVED').optional()}).strict();
async function makePreview(req:Request,res:Response){const input=z.object({items:bookingItemsSchema}).strict().parse(req.body);const preview=await previewBooking(db,input.items);return send(res,req,{...preview,paymentMode:simulatedCheckoutEnabled?'SIMULATED':'UNAVAILABLE'});}
async function makeBooking(req:Request,res:Response){
  const input=bookingRequestSchema.parse(req.body);if(!simulatedCheckoutEnabled)return fail(res,req,503,'Simulated checkout is disabled in production. Configure PAYMENT_MODE=demo and ALLOW_SIMULATED_CHECKOUT_IN_PRODUCTION=true to enable it.');if(input.confirmed!==true||input.paymentToken!=='DEMO_APPROVED')return fail(res,req,400,'Explicit confirmation and simulated payment approval are required.');
  const key=req.header('idempotency-key');if(!key||key.length<16||key.length>128)return fail(res,req,400,'Idempotency-Key header (16â€“128 characters) is required.');
  const booking=await createBooking(db,req.userId!,input.items,key);return send(res,req,booking,201);
}
app.post('/api/bookings/preview',authenticate,route(makePreview));
app.post('/api/bookings',authenticate,route(makeBooking));
app.get('/api/bookings',authenticate,route(async(req,res)=>{const rows=await db.booking.findMany({where:{userId:req.userId},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:{include:{hotelRoom:{include:{hotel:true}}}}}},payment:true},orderBy:{createdAt:'desc'}});return send(res,req,rows);}));
app.get('/api/bookings/:id',authenticate,route(async(req,res)=>{const booking=await db.booking.findFirst({where:{userId:req.userId,OR:[{id:routeParam(req,'id')},{bookingCode:routeParam(req,'id')}]},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:{include:{hotelRoom:{include:{hotel:true}}}}}},payment:true}});if(!booking)return fail(res,req,404,'Booking not found.');return send(res,req,booking);}));
app.post('/api/bookings/:id/cancel',authenticate,route(async(req,res)=>send(res,req,await cancelBooking(db,req.userId!,routeParam(req,'id')))));

const draftPassengerSchema=z.object({firstName:z.string().max(80).optional(),lastName:z.string().max(80).optional(),email:z.string().max(254).optional(),phone:z.string().max(20).optional()});
const draftSchema=z.object({flightId:z.string().optional(),flightSeatIds:z.array(z.string()).max(9).default([]),travelerCount:z.number().int().min(1).max(9).default(1),hotelId:z.string().optional(),roomId:z.string().optional(),roomCount:z.number().int().min(1).max(5).default(1),checkIn:z.string().datetime().optional(),checkOut:z.string().datetime().optional(),guests:z.number().int().min(1).max(12).default(1),passengers:z.array(draftPassengerSchema).max(12).default([]),idempotencyKey:z.string().uuid().optional()}).strict();
app.get('/api/booking-draft',authenticate,route(async(req,res)=>{const draft=await db.bookingDraft.findUnique({where:{userId:req.userId}});if(!draft||draft.expiresAt<=new Date()){if(draft)await db.bookingDraft.delete({where:{id:draft.id}});return send(res,req,null);}return send(res,req,{id:draft.id,payload:draft.payload,expiresAt:draft.expiresAt});}));
app.put('/api/booking-draft',authenticate,route(async(req,res)=>{const payload=draftSchema.parse(req.body);const draft=await db.bookingDraft.upsert({where:{userId:req.userId!},create:{userId:req.userId!,payload:payload as unknown as Prisma.InputJsonValue,expiresAt:new Date(Date.now()+2*60*60*1000)},update:{payload:payload as unknown as Prisma.InputJsonValue,expiresAt:new Date(Date.now()+2*60*60*1000)}});return send(res,req,{id:draft.id,expiresAt:draft.expiresAt},200);}));
app.delete('/api/booking-draft',authenticate,route(async(req,res)=>{await db.bookingDraft.deleteMany({where:{userId:req.userId}});return send(res,req,{deleted:true});}));

// The independent agent uses the same booking service and validations as customer requests.
app.get('/api/agent/health',authenticateAgent,(req,res)=>send(res,req,{status:'ok',service:'TravelEase agent API',version:'2'}));
app.get('/api/agent/flights/search',authenticateAgent,route(async(req,res)=>send(res,req,await searchFlights(req.query as Record<string,unknown>))));
app.get('/api/agent/flights/:id',authenticateAgent,route(async(req,res)=>{const f=await db.flight.findUnique({where:{id:routeParam(req,'id')},include:{airline:true,origin:true,destination:true,seats:{where:{available:true,bookingItemId:null}}}});if(!f)return fail(res,req,404,'Flight not found.');return send(res,req,f);}));
app.get('/api/agent/hotels/search',authenticateAgent,route(async(req,res)=>send(res,req,await searchHotels(req.query as Record<string,unknown>))));
app.get('/api/agent/hotels/:id',authenticateAgent,route(async(req,res)=>{const q=hotelQuery.parse(req.query);const h=await db.hotel.findUnique({where:{id:routeParam(req,'id')},include:{rooms:{where:hotelAvailabilityWhere(q),include:{reservations:reservationWindow(q)}}}});if(!h)return fail(res,req,404,'Hotel not found.');const rooms=h.rooms.filter(r=>r.units-(r.reservations?.length||0)>=q.rooms);return send(res,req,{...h,rooms,availableRooms:rooms.length});}));
app.get('/api/agent/bookings/by-idempotency/:key',authenticateAgent,authenticate,route(async(req,res)=>{const b=await db.booking.findFirst({where:{userId:req.userId,idempotencyKey:routeParam(req,'key')},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});if(!b)return fail(res,req,404,'No booking exists for that idempotency key.');return send(res,req,b);}));
app.get('/api/agent/bookings/:id',authenticateAgent,authenticate,route(async(req,res)=>{const b=await db.booking.findFirst({where:{userId:req.userId,OR:[{id:routeParam(req,'id')},{bookingCode:routeParam(req,'id')}]},include:{items:{include:{passengers:true,flightSeats:true,hotelReservation:true}},payment:true}});if(!b)return fail(res,req,404,'Booking not found.');return send(res,req,b);}));
app.post('/api/agent/bookings/preview',authenticateAgent,authenticate,route(makePreview));
app.post('/api/agent/bookings',authenticateAgent,authenticate,route(makeBooking));
app.post('/api/agent/bookings/:id/cancel',authenticateAgent,authenticate,route(async(req,res)=>send(res,req,await cancelBooking(db,req.userId!,routeParam(req,'id')))));

app.use((req,res)=>fail(res,req,404,'Route not found.'));
app.use((error:unknown,req:Request,res:Response,_next:NextFunction)=>{
  if(res.headersSent)return;
  if(error instanceof z.ZodError)return fail(res,req,422,'Request validation failed.',JSON.stringify(error.issues.map(i=>({path:i.path,message:i.message}))));
  if(error instanceof HttpError)return fail(res,req,error.status,error.message,error.code);
  if(error instanceof SyntaxError&&'body' in error)return fail(res,req,400,'Malformed JSON request.');
  if(error instanceof Prisma.PrismaClientKnownRequestError){
    if(error.code==='P2002')return fail(res,req,409,'A record with those unique values already exists.');
    if(error.code==='P2025')return fail(res,req,404,'The requested record was not found.');
  }
  const message=error instanceof Error?error.message:'Unknown error';console.error(JSON.stringify({level:'error',requestId:req.requestId,method:req.method,path:req.path,errorType:error instanceof Error?error.name:'UnknownError',message}));return res.status(500).json({success:false,data:null,error:{message:'An unexpected server error occurred.',...(process.env.NODE_ENV==='production'?{}:{method:req.method,path:req.path})},requestId:req.requestId});
});

let server:ReturnType<typeof app.listen>|undefined;
async function start(){
  for(const key of ['DATABASE_URL','JWT_SECRET','AGENT_API_KEY'])if(!process.env[key]||process.env[key]!.startsWith('replace-with'))throw new Error(`Required environment variable ${key} is missing or still a placeholder.`);
  if(process.env.JWT_SECRET!.length<32)throw new Error('JWT_SECRET must be at least 32 characters.');
  await db.$connect();
  server=app.listen(port,()=>console.log(JSON.stringify({level:'info',message:'TravelEase API listening',port,production:isProduction})));
}
void start().catch(error=>{console.error(JSON.stringify({level:'fatal',message:error instanceof Error?error.message:'Startup failed'}));process.exit(1);});
async function shutdown(signal:string){console.log(JSON.stringify({level:'info',message:'Shutting down',signal}));if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await db.$disconnect();process.exit(0);}
process.once('SIGINT',()=>void shutdown('SIGINT'));process.once('SIGTERM',()=>void shutdown('SIGTERM'));
