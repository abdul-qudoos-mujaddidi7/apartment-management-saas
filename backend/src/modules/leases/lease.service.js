const prisma = require('../../lib/prisma');
const { lockGuarantor } = require('../guarantors/guarantor.service');
const { addMonths, initialNextInvoiceDate, normalizeRentCycle } = require('../../lib/rent-cycle');
const fail=(code,message)=>Object.assign(new Error(message),{code});
const select={ guarantorId:true,guarantor:{select:{id:true,firstName:true,lastName:true,phone:true,nationalId:true,address:true}}, id:true,contractNumber:true,startDate:true,endDate:true,monthlyRent:true,securityDeposit:true,currency:true,securityDepositCurrency:true,serviceFee:true,serviceFeeCurrency:true,rentCycleMonths:true,nextInvoiceDate:true,lastInvoiceDate:true,paymentDueDay:true,status:true,notes:true,createdAt:true,updatedAt:true, tenant:{select:{id:true,firstName:true,phone:true,status:true}}, apartment:{select:{id:true,apartmentNumber:true,name:true,floor:{select:{id:true,floorNumber:true,name:true,building:{select:{id:true,name:true,code:true}}}}}} };
const scope=(organizationId)=>({organizationId,deletedAt:null});
/**
 * The currency a lease's rent is agreed in.
 *
 * A lease may only be denominated in a currency the organization actually has —
 * its reporting currency or one of its active currencies — because monthly
 * invoices are raised in it. Omitting the code means the reporting currency,
 * which is what every lease agreed before this field existed was in.
 */
async function resolveLeaseCurrency(organizationId,requested){ const organization=await prisma.organization.findFirst({where:{id:organizationId,deletedAt:null},select:{baseCurrency:true}}); const base=String(organization?.baseCurrency||'AFN').trim().toUpperCase(); if(requested===undefined||requested===null||requested==='')return base; const code=String(requested).trim().toUpperCase(); if(!/^[A-Z]{3}$/.test(code))throw fail('INVALID_CURRENCY_CODE','Use a three-letter currency code such as USD.'); if(code===base)return code; const row=await prisma.currency.findFirst({where:{organizationId,code,deletedAt:null,isActive:true},select:{id:true}}); if(!row)throw fail('CURRENCY_NOT_SUPPORTED',`${code} is not an active currency for this organization.`); return code; }
async function assertRelations(organizationId,data){ const [tenant,apartment]=await Promise.all([prisma.tenant.findFirst({where:{id:data.tenantId,...scope(organizationId)},select:{id:true,status:true}}),prisma.apartment.findFirst({where:{id:data.apartmentId,...scope(organizationId),floor:{deletedAt:null,building:{organizationId,deletedAt:null}}},select:{id:true}})]); if(!tenant) throw fail('TENANT_NOT_FOUND','Tenant not found.'); if(!apartment) throw fail('APARTMENT_NOT_FOUND','Apartment not found.'); if(data.status==='ACTIVE'&&tenant.status!=='ACTIVE') throw fail('TENANT_INACTIVE','Tenant must be active to activate a lease.'); }
async function assertAvailability(organizationId,apartmentId,excludeId){ const active=await prisma.lease.findFirst({where:{...scope(organizationId),apartmentId,status:'ACTIVE',...(excludeId?{id:{not:excludeId}}:{})},select:{contractNumber:true}}); if(active) throw fail('APARTMENT_ALREADY_LEASED',`Apartment already has an active lease (${active.contractNumber}).`); }
async function listLeases(organizationId,q){const where={...scope(organizationId),...(q.tenantId?{tenantId:q.tenantId}:{}),...(q.apartmentId?{apartmentId:q.apartmentId}:{}),...(q.buildingId?{apartment:{floor:{buildingId:q.buildingId}}}:{}),...(q.status?{status:q.status}:{}),...(q.search?{contractNumber:{contains:q.search}}:{})}; const [items,total]=await prisma.$transaction([prisma.lease.findMany({where,select,orderBy:{createdAt:'desc'},skip:(q.page-1)*q.pageSize,take:q.pageSize}),prisma.lease.count({where})]); return {items:items.map(format),pagination:{page:q.page,pageSize:q.pageSize,total,totalPages:Math.ceil(total/q.pageSize)}};}
const format=(x)=>({...x,monthlyRent:Number(x.monthlyRent),securityDeposit:Number(x.securityDeposit),serviceFee:Number(x.serviceFee),rentCycleMonths:normalizeRentCycle(x.rentCycleMonths),currency:x.currency||'AFN',securityDepositCurrency:x.securityDepositCurrency||x.currency||'AFN',serviceFeeCurrency:x.serviceFeeCurrency||x.currency||'AFN'});
async function getLease(org,id){const x=await prisma.lease.findFirst({where:{id,...scope(org)},select});if(!x)throw fail('LEASE_NOT_FOUND','Lease not found.');return format(x)}
async function createLeaseRecord(org,data,db){await assertRelations(org,data);if(data.status==='ACTIVE')await assertAvailability(org,data.apartmentId);const currency=await resolveLeaseCurrency(org,data.currency);const securityDepositCurrency=await resolveLeaseCurrency(org,data.securityDepositCurrency||currency);const serviceFeeCurrency=await resolveLeaseCurrency(org,data.serviceFeeCurrency||currency);try{return format(await db.lease.create({data:{...data,currency,securityDepositCurrency,serviceFeeCurrency,organizationId:org,nextInvoiceDate:initialNextInvoiceDate(data.startDate,data.rentCycleMonths)},select}))}catch(e){if(e.code==='P2002')throw fail('CONTRACT_NUMBER_EXISTS','Contract number already exists.');throw e}}
async function updateLeaseRecord(org,id,data,db){const current=await prisma.lease.findFirst({where:{id,...scope(org)}});if(!current)throw fail('LEASE_NOT_FOUND','Lease not found.');const next={tenantId:data.tenantId||current.tenantId,apartmentId:data.apartmentId||current.apartmentId,status:data.status||current.status,startDate:data.startDate||current.startDate,endDate:data.endDate||current.endDate};if(next.startDate>=next.endDate)throw fail('INVALID_LEASE_DATES','Start date must be before end date.');await assertRelations(org,next);if(next.status==='ACTIVE')await assertAvailability(org,next.apartmentId,id);const patch={...data};if(patch.currency!==undefined)patch.currency=await resolveLeaseCurrency(org,patch.currency);if(patch.securityDepositCurrency!==undefined)patch.securityDepositCurrency=await resolveLeaseCurrency(org,patch.securityDepositCurrency);if(patch.serviceFeeCurrency!==undefined)patch.serviceFeeCurrency=await resolveLeaseCurrency(org,patch.serviceFeeCurrency);/* The billing schedule follows the lease terms. Until the first invoice is
   raised, the next one is always start + cycle, so moving the start date or
   the cycle simply moves it. Once billing has begun, only a cycle change
   re-times the schedule: it is measured from the last invoice, never from the
   start, so changing the cycle cannot suddenly re-bill months already billed. */
const nextCycle=normalizeRentCycle(patch.rentCycleMonths!==undefined?patch.rentCycleMonths:current.rentCycleMonths);const nextStart=patch.startDate!==undefined?patch.startDate:current.startDate;if(!current.lastInvoiceDate){patch.nextInvoiceDate=initialNextInvoiceDate(nextStart,nextCycle);}else if(patch.rentCycleMonths!==undefined){patch.nextInvoiceDate=addMonths(current.lastInvoiceDate,nextCycle);}try{await db.lease.updateMany({where:{id,...scope(org)},data:patch});return format(await db.lease.findFirst({where:{id,...scope(org)},select}))}catch(e){if(e.code==='P2002')throw fail('CONTRACT_NUMBER_EXISTS','Contract number already exists.');throw e}}
async function removeLease(org,id){const r=await prisma.lease.updateMany({where:{id,...scope(org)},data:{deletedAt:new Date()}});if(!r.count)throw fail('LEASE_NOT_FOUND','Lease not found.')}
async function createLease(org,data){
  return prisma.$transaction(async tx => {
    if(data.guarantorId) await lockGuarantor(tx,org,data.guarantorId);
    return createLeaseRecord(org,data,tx);
  });
}
async function updateLease(org,id,data){
  return prisma.$transaction(async tx => {
    if(data.guarantorId) await lockGuarantor(tx,org,data.guarantorId);
    return updateLeaseRecord(org,id,data,tx);
  });
}
module.exports={listLeases,getLease,createLease,updateLease,removeLease};
