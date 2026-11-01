// Shared by standalone test runtimes; never imported by production code.
const {PrismaClient}=require('@prisma/client');
async function lockE2EDatabase(source){
 const url=new URL(source);if(url.hostname!=='127.0.0.1'||url.port!=='3307'||url.pathname!=='/crefans_platform_dev')throw Error('Isolated loopback development DB required');url.searchParams.set('connection_limit','1');
 const lock=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{const rows=await lock.$queryRaw`SELECT GET_LOCK('crefans-e2e-suite',0) AS acquired`;if(Number(rows[0].acquired)!==1)throw Error('E2E database is busy; stop the other test runtime first');}catch(e){await lock.$disconnect();throw e;}
 return async()=>{try{await lock.$queryRaw`SELECT RELEASE_LOCK('crefans-e2e-suite')`;}finally{await lock.$disconnect();}};
}
module.exports={lockE2EDatabase};
