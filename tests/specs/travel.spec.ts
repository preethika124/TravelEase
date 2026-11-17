import {test,expect} from '@playwright/test';
const flight=(id:string,code:string,name:string,price:number)=>({id,airline:{id:code,code,name},origin:{id:'a',code:'HYD',name:'Hyderabad Airport',city:'Hyderabad',state:'Telangana'},destination:{id:'b',code:'VTZ',name:'Visakhapatnam Airport',city:'Visakhapatnam',state:'Andhra Pradesh'},departure:'2027-01-10T08:15:00.000Z',arrival:'2027-01-10T10:30:00.000Z',durationMins:135,price,currency:'INR',cabin:'ECONOMY',availableSeats:6});
test.beforeEach(async({page})=>{
  await page.route('http://localhost:4000/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path.endsWith('/me'))return route.fulfill({status:401,json:{success:false,data:null,error:{message:'Sign in required.'},requestId:'test'}});
    if(path.endsWith('/booking-draft'))return route.fulfill({json:{success:true,data:null,error:null,requestId:'test'}});
    if(path.endsWith('/flights/search')){const rows=[flight('f1','6E','IndiGo',5300),flight('f2','AI','Air India',7200)],air=url.searchParams.get('airline');return route.fulfill({json:{success:true,data:air?rows.filter(row=>row.airline.name===air):rows,error:null,requestId:'test'}})}
    if(path.endsWith('/hotels/search')){const rated=Number(url.searchParams.get('minRating')||0);const rows=rated>=4.5?[]:[{id:'h1',name:'Demo Hyderabad Stay',city:'Hyderabad',address:'Banjara Hills',rating:4.8,description:'A demo stay.',rooms:[{id:'r1',name:'Deluxe Room',capacity:2,pricePerNight:9800,amenities:['Breakfast'],cancellationPolicy:'Free cancellation'}],availableRooms:5}];return route.fulfill({json:{success:true,data:rows,error:null,requestId:'test'}})}
    return route.fulfill({status:404,json:{success:false,data:null,error:{message:'Not mocked'},requestId:'test'}});
  });
});
test('home starts a live flight search',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:/go somewhere/i})).toBeVisible();await page.getByRole('button',{name:/search/i}).click();await expect(page).toHaveURL(/flights/);await expect(page.getByText('2 flights')).toBeVisible();await expect(page.locator('.flight-card').filter({hasText:'IndiGo'})).toBeVisible()});
test('flight airline filter changes the API result set',async({page})=>{await page.goto('/flights');await expect(page.getByText('2 flights')).toBeVisible();await page.getByLabel('Filter airline').selectOption({label:'IndiGo'});await expect(page.getByText('1 flights')).toBeVisible();await expect(page.locator('.flight-card').filter({hasText:'Air India'})).toHaveCount(0)});
test('booking pages require an authenticated customer',async({page})=>{await page.goto('/checkout');await expect(page).toHaveURL(/login/);await expect(page.getByRole('heading',{name:/good to have you back/i})).toBeVisible()});
test('hotel rating filter refreshes results',async({page})=>{await page.goto('/hotels');await expect(page.getByText('1 stays')).toBeVisible();await page.getByRole('radio',{name:'4.5+ stars'}).check();await expect(page.getByText('0 stays')).toBeVisible()});
