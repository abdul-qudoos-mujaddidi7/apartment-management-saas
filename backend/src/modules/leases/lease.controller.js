const { z } = require('zod'); const service=require('./lease.service'); const {createLeaseSchema,updateLeaseSchema,listLeasesSchema}=require('./lease.validation');
const org=(req)=>req.user?.organizations?.[0]?.id;
const invalid=(res,r)=>res.status(400).json({success:false,code:'INVALID_LEASE_DATA',message:'Invalid lease data.',errors:z.flattenError(r.error).fieldErrors});
const handle=(e,res,next)=>['LEASE_NOT_FOUND','TENANT_NOT_FOUND','APARTMENT_NOT_FOUND'].includes(e.code)?res.status(404).json({success:false,code:e.code,message:e.message}):['APARTMENT_ALREADY_LEASED','CONTRACT_NUMBER_EXISTS','TENANT_INACTIVE'].includes(e.code)?res.status(409).json({success:false,code:e.code,message:e.message}):e.code==='INVALID_LEASE_DATES'?res.status(400).json({success:false,code:e.code,message:e.message}):next(e);
async function list(req,res,next){try{const r=listLeasesSchema.safeParse(req.query);if(!r.success)return invalid(res,r);res.json({success:true,...await service.listLeases(org(req),r.data)})}catch(e){handle(e,res,next)}}
async function get(req,res,next){try{res.json({success:true,lease:await service.getLease(org(req),req.params.id)})}catch(e){handle(e,res,next)}}
async function create(req,res,next){try{const r=createLeaseSchema.safeParse(req.body);if(!r.success)return invalid(res,r);res.status(201).json({success:true,lease:await service.createLease(org(req),r.data)})}catch(e){handle(e,res,next)}}
async function update(req,res,next){try{const r=updateLeaseSchema.safeParse(req.body);if(!r.success)return invalid(res,r);res.json({success:true,lease:await service.updateLease(org(req),req.params.id,r.data)})}catch(e){handle(e,res,next)}}
async function remove(req,res,next){try{await service.removeLease(org(req),req.params.id);res.json({success:true,message:'Lease deleted successfully.'})}catch(e){handle(e,res,next)}}
module.exports={list,get,create,update,remove};
