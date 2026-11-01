/** Aggregate only; never expose supporter identities through public post data. */
export async function postSupporterCount(db:any,postId:string):Promise<number>{
 const rows=await db.$queryRaw`SELECT COUNT(DISTINCT sender_id) AS total FROM bean_tips WHERE post_id=${postId}`;
 return Number(rows[0]?.total||0);
}
