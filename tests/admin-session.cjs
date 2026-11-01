// Test helper: an operator console session (admin_sessions), separate from member sessions.
const {randomBytes,randomUUID}=require('node:crypto'),{digest}=require('../dist/src/auth/local/credentials');
module.exports=async function adminCookie(db,adminId){const token='aa.'+randomBytes(32).toString('base64url');await db.adminSession.create({data:{admin_id:adminId,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});return 'admin_access_token='+token;};
