import axios from 'axios';

export const api = axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:4000/api',timeout:15000,withCredentials:true});
api.interceptors.response.use(response=>response,error=>{if(error?.response?.status===401&&!String(error?.config?.url||'').includes('/auth/'))window.dispatchEvent(new Event('travelease:session-expired'));return Promise.reject(error)});
export type ApiEnvelope<T>={success:boolean;data:T;error:null|{message:string};requestId:string};
export async function apiData<T>(request:Promise<{data:ApiEnvelope<T>}>):Promise<T>{const response=await request;return response.data.data}
